// src/reflow/reflow.service.ts
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

    // Clone work orders so we don't mutate caller input
    const woMap = new Map<string, WorkOrder>(
      input.workOrders.map((w) => [w.docId, structuredClone(w)]),
    );

    // 1) Enforce dependency correctness (includes cycle detection)
    const topoIds = topoSortWorkOrders(Array.from(woMap.values()));

    // 2) Per work center blocked intervals = maintenance windows + already scheduled work orders
    const centerBlocked = new Map<string, Interval[]>();
    for (const wc of input.workCenters) {
      centerBlocked.set(wc.docId, buildMaintenanceIntervals(wc));
    }

    // 3) Lock maintenance work orders (immovable) - they still occupy the work center
    for (const wo of woMap.values()) {
      if (!wo.data.isMaintenance) continue;

      const blocked = centerBlocked.get(wo.data.workCenterId);
      if (!blocked) throw new Error(`Missing center: ${wo.data.workCenterId}`);

      blocked.push(buildOrderInterval(wo));
      centerBlocked.set(wo.data.workCenterId, sortIntervals(blocked));
    }

    const changes: Change[] = [];
    const explanation: string[] = [];

    // Store scheduled results in topo order (for dependency lookups)
    const scheduled = new Map<string, WorkOrder>();

    // 4) Schedule in topo order
    for (const id of topoIds) {
      const wo = woMap.get(id);
      if (!wo) throw new Error(`Missing work order: ${id}`);

      const wc = wcMap.get(wo.data.workCenterId);
      if (!wc) throw new Error(`Work center missing: ${wo.data.workCenterId}`);

      // Maintenance orders are locked — just record and continue
      if (wo.data.isMaintenance) {
        scheduled.set(id, wo);
        continue;
      }

      const originalStart = wo.data.startDate;
      const originalEnd = wo.data.endDate;

      // 4.1) Earliest start = max(original start, latest parent end)
      let earliest = DateTime.fromISO(wo.data.startDate, { zone: "utc" });

      if (wo.data.dependsOnWorkOrderIds.length > 0) {
        let latestParentEnd = earliest;

        for (const parentId of wo.data.dependsOnWorkOrderIds) {
          const parent = scheduled.get(parentId);
          if (!parent) {
            throw new Error(
              `Parent not scheduled yet (unexpected topo issue): ${parentId}`,
            );
          }

          const pEnd = DateTime.fromISO(parent.data.endDate, { zone: "utc" });
          if (pEnd > latestParentEnd) latestParentEnd = pEnd;
        }

        earliest = latestParentEnd;
      }

      // 4.2) Working minutes required (duration + optional setup)
      const totalMinutes =
        wo.data.durationMinutes + (wo.data.setupTimeMinutes ?? 0);

      // 4.3) Blocked = maintenance + already scheduled orders on the same center
      const blocked = sortIntervals(centerBlocked.get(wc.docId) ?? []);

      // 4.4) Schedule using shift + blocked-time aware allocator
      const { startISO, endISO } = scheduleWithShiftsAndBlocks({
        startISO: earliest.toISO()!,
        durationMinutes: totalMinutes,
        shifts: wc.data.shifts,
        blocked,
      });

      wo.data.startDate = startISO;
      wo.data.endDate = endISO;

      // 4.5) Add this work order to blocked intervals for this work center
      const blockedNow = centerBlocked.get(wc.docId) ?? [];
      blockedNow.push(buildOrderInterval(wo));
      centerBlocked.set(wc.docId, sortIntervals(blockedNow));

      // 4.6) Record changes
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
      "Each work order is scheduled by allocating working minutes inside shift windows while skipping maintenance windows and existing bookings.",
    );

    const updatedWorkOrders = topoIds
      .map((id) => scheduled.get(id))
      .filter((x): x is WorkOrder => Boolean(x));

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
