import { DateTime } from "luxon";
import {
  Change,
  ReflowInput,
  ReflowResult,
  WorkCenter,
  WorkOrder,
} from "./types";
import { topoSortWorkOrders } from "./dag";
import { Interval, sortIntervals } from "../utils/interval-utils";
import { scheduleWithShiftsAndBlocks } from "../utils/date-utils";
import {
  buildMaintenanceIntervals,
  buildOrderInterval,
} from "./constraint-checker";

export class ReflowService {
  reflow(input: ReflowInput): ReflowResult {
    const wcMap = new Map<string, WorkCenter>(
      input.workCenters.map((w) => [w.docId, w]),
    );
    const woMap = new Map<string, WorkOrder>(
      input.workOrders.map((w) => [w.docId, structuredClone(w)]),
    );

    // Topological order ensures dependencies scheduled first
    const topoIds = topoSortWorkOrders(Array.from(woMap.values()));

    // Per work center: blocked intervals = maintenance windows + scheduled work orders
    const centerBooked = new Map<string, Interval[]>();
    for (const wc of input.workCenters) {
      centerBooked.set(wc.docId, buildMaintenanceIntervals(wc));
    }

    // First, lock maintenance work orders into schedule (immovable)
    // They still occupy the work center
    for (const wo of woMap.values()) {
      if (!wo.data.isMaintenance) continue;
      const booked = centerBooked.get(wo.data.workCenterId);
      if (!booked)
        throw new Error(`Missing center bookings: ${wo.data.workCenterId}`);
      booked.push(buildOrderInterval(wo));
      centerBooked.set(wo.data.workCenterId, sortIntervals(booked));
    }

    const changes: Change[] = [];
    const explanation: string[] = [];

    // For dependency lookup of computed end times
    const scheduled = new Map<string, WorkOrder>();

    for (const id of topoIds) {
      const wo = woMap.get(id)!;
      const wc = wcMap.get(wo.data.workCenterId);
      if (!wc) throw new Error(`Work center missing: ${wo.data.workCenterId}`);

      // Maintenance orders are immovable; just record them
      if (wo.data.isMaintenance) {
        scheduled.set(id, wo);
        continue;
      }

      const originalStart = wo.data.startDate;
      const originalEnd = wo.data.endDate;

      // Earliest start based on dependencies
      let earliest = DateTime.fromISO(wo.data.startDate, { zone: "utc" });

      if (wo.data.dependsOnWorkOrderIds.length > 0) {
        let latestParentEnd = earliest;
        for (const parentId of wo.data.dependsOnWorkOrderIds) {
          const parent = scheduled.get(parentId);
          if (!parent) {
            throw new Error(
              `Parent not scheduled yet (unexpected): ${parentId}`,
            );
          }
          const parentEnd = DateTime.fromISO(parent.data.endDate, {
            zone: "utc",
          });
          if (parentEnd > latestParentEnd) latestParentEnd = parentEnd;
        }
        earliest = latestParentEnd;
      }

      // Total working minutes includes optional setup time
      const totalMinutes =
        wo.data.durationMinutes + (wo.data.setupTimeMinutes ?? 0);

      // Blocked intervals: maintenance + already scheduled orders on this center
      const blocked = sortIntervals(centerBooked.get(wc.docId) ?? []);

      // Schedule within shifts and blocks
      const { startISO, endISO } = scheduleWithShiftsAndBlocks({
        startISO: earliest.toISO()!,
        durationMinutes: totalMinutes,
        shifts: wc.data.shifts,
        blocked,
      });

      // Update work order
      wo.data.startDate = startISO;
      wo.data.endDate = endISO;

      // Add this work order to bookings for this center
      const bookedNow = centerBooked.get(wc.docId) ?? [];
      bookedNow.push(buildOrderInterval(wo));
      centerBooked.set(wc.docId, sortIntervals(bookedNow));

      // Record change
      if (
        originalStart !== wo.data.startDate ||
        originalEnd !== wo.data.endDate
      ) {
        const deltaMinutes = Math.floor(
          DateTime.fromISO(wo.data.endDate, { zone: "utc" }).diff(
            DateTime.fromISO(originalEnd, { zone: "utc" }),
            "minutes",
          ).minutes,
        );

        changes.push({
          workOrderId: wo.docId,
          workOrderNumber: wo.data.workOrderNumber,
          reason: "Reflow: dependencies / shifts / maintenance / conflicts",
          oldStart: originalStart,
          newStart: wo.data.startDate,
          oldEnd: originalEnd,
          newEnd: wo.data.endDate,
          deltaMinutes,
        });
      }

      scheduled.set(id, wo);
    }

    explanation.push(
      "Orders are processed in dependency order (topological sort). Maintenance work orders are locked and occupy capacity.",
    );
    explanation.push(
      "Each work order is scheduled using working-minutes allocation inside shift windows, skipping maintenance windows and existing bookings.",
    );

    const updatedWorkOrders = topoIds
      .map((id) => scheduled.get(id)!)
      .filter(Boolean);

    const totalDelayMinutes = changes.reduce(
      (sum, c) => sum + Math.max(0, c.deltaMinutes),
      0,
    );

    return {
      updatedWorkOrders,
      changes,
      explanation,
      metrics: {
        totalDelayMinutes,
        movedCount: changes.length,
      },
    };
  }
}
