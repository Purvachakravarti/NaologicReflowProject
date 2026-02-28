import { DateTime } from "luxon";
import { WorkOrder, WorkCenter } from "./types";
import { Interval, overlaps, sortIntervals } from "../utils/interval-utils";

export function buildMaintenanceIntervals(workCenter: WorkCenter): Interval[] {
  return workCenter.data.maintenanceWindows.map((m) => ({
    start: DateTime.fromISO(m.startDate, { zone: "utc" }),
    end: DateTime.fromISO(m.endDate, { zone: "utc" }),
    reason: m.reason ?? "maintenance",
  }));
}

export function buildOrderInterval(order: WorkOrder): Interval {
  return {
    start: DateTime.fromISO(order.data.startDate, { zone: "utc" }),
    end: DateTime.fromISO(order.data.endDate, { zone: "utc" }),
    reason: `workOrder:${order.data.workOrderNumber}`,
  };
}

export function validateNoWorkCenterOverlaps(workOrders: WorkOrder[]): void {
  const byCenter = new Map<string, WorkOrder[]>();
  for (const wo of workOrders) {
    const list = byCenter.get(wo.data.workCenterId) ?? [];
    list.push(wo);
    byCenter.set(wo.data.workCenterId, list);
  }

  for (const [wcId, orders] of byCenter.entries()) {
    const intervals = sortIntervals(orders.map(buildOrderInterval));
    for (let i = 1; i < intervals.length; i++) {
      if (overlaps(intervals[i - 1], intervals[i])) {
        throw new Error(
          `Overlap detected on workCenter=${wcId}: ${intervals[i - 1].reason} overlaps ${intervals[i].reason}`,
        );
      }
    }
  }
}

export function validateMaintenanceRespected(
  workOrders: WorkOrder[],
  workCenters: WorkCenter[],
): void {
  const wcMap = new Map(workCenters.map((w) => [w.docId, w]));
  for (const wo of workOrders) {
    const wc = wcMap.get(wo.data.workCenterId);
    if (!wc) throw new Error(`Missing work center: ${wo.data.workCenterId}`);
    const maint = buildMaintenanceIntervals(wc);
    const woInt = buildOrderInterval(wo);
    for (const m of maint) {
      if (overlaps(woInt, m)) {
        throw new Error(
          `Maintenance violated for workOrder=${wo.data.workOrderNumber} on center=${wc.data.name}`,
        );
      }
    }
  }
}
