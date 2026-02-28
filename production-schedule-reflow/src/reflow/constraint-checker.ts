import { DateTime } from "luxon";
import { WorkOrder, WorkCenter } from "../reflow/types";
import { Interval, overlaps, sortIntervals } from "../utils/interval-utils";

/**
 * Convert a work center's maintenance windows into Luxon-based intervals.
 */
export function buildMaintenanceIntervals(workCenter: WorkCenter): Interval[] {
  return workCenter.data.maintenanceWindows.map((m) => ({
    start: DateTime.fromISO(m.startDate, { zone: "utc" }),
    end: DateTime.fromISO(m.endDate, { zone: "utc" }),
    reason: m.reason ?? "maintenance",
  }));
}

/**
 * Convert a work order into an interval [start, end) in UTC.
 * NOTE: This interval represents the *elapsed span* for the work order,
 * which may include pauses outside shifts or during maintenance.
 */
export function buildOrderInterval(order: WorkOrder): Interval {
  return {
    start: DateTime.fromISO(order.data.startDate, { zone: "utc" }),
    end: DateTime.fromISO(order.data.endDate, { zone: "utc" }),
    reason: `workOrder:${order.data.workOrderNumber}`,
  };
}

/**
 * Hard constraint: work center capacity is 1 => no overlapping work orders
 * on the same work center in elapsed-time.
 *
 * This is valid because even if a job pauses, it is considered "occupying"
 * the work center in the schedule timeline for the purposes of this test
 * (single continuous start/end representation).
 *
 * @upgrade If you model work as multiple segments (pause/resume), then
 * capacity checking should validate segment-level overlaps instead.
 */
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

/**
 * Maintenance constraint validation.
 *
 * IMPORTANT: In this solution, each work order is represented as a single
 * elapsed start/end. Since work pauses during maintenance and outside shifts,
 * it is allowed for maintenance windows to fall *inside* the elapsed span.
 *
 * Therefore, we validate a weaker but correct condition for this representation:
 * - A work order must not START inside a maintenance window
 * - A work order must not END inside a maintenance window
 *
 * This ensures the scheduler didn't place the boundary moments inside blocked time.
 *
 * @upgrade For full correctness, return and validate *work segments* from
 * scheduleWithShiftsAndBlocks (actual working intervals), and ensure those
 * segments do not overlap maintenance windows.
 */
export function validateMaintenanceRespected(
  workOrders: WorkOrder[],
  workCenters: WorkCenter[],
): void {
  const wcMap = new Map(workCenters.map((w) => [w.docId, w]));

  for (const wo of workOrders) {
    const wc = wcMap.get(wo.data.workCenterId);
    if (!wc) throw new Error(`Missing work center: ${wo.data.workCenterId}`);

    const start = DateTime.fromISO(wo.data.startDate, { zone: "utc" });
    const end = DateTime.fromISO(wo.data.endDate, { zone: "utc" });

    for (const mw of wc.data.maintenanceWindows) {
      const mStart = DateTime.fromISO(mw.startDate, { zone: "utc" });
      const mEnd = DateTime.fromISO(mw.endDate, { zone: "utc" });

      const startsInside = start >= mStart && start < mEnd;
      const endsInside = end > mStart && end <= mEnd;

      if (startsInside || endsInside) {
        throw new Error(
          `Maintenance boundary violated for workOrder=${wo.data.workOrderNumber} on center=${wc.data.name}`,
        );
      }
    }
  }
}
