import { ReflowInput, WorkCenter, WorkOrder } from "../reflow/types";

// Mon-Fri 8-17 shifts (UTC)
const dayShift = [
  { dayOfWeek: 1, startHour: 8, endHour: 17 },
  { dayOfWeek: 2, startHour: 8, endHour: 17 },
  { dayOfWeek: 3, startHour: 8, endHour: 17 },
  { dayOfWeek: 4, startHour: 8, endHour: 17 },
  { dayOfWeek: 5, startHour: 8, endHour: 17 },
];

const wc1: WorkCenter = {
  docId: "wc1",
  docType: "workCenter",
  data: {
    name: "Extrusion Line 1",
    shifts: dayShift,
    maintenanceWindows: [
      // Scenario 3 uses this
      {
        startDate: "2026-03-03T10:00:00Z",
        endDate: "2026-03-03T13:00:00Z",
        reason: "Planned maintenance",
      },
    ],
  },
};

const wc2: WorkCenter = {
  docId: "wc2",
  docType: "workCenter",
  data: {
    name: "Extrusion Line 2",
    shifts: dayShift,
    maintenanceWindows: [],
  },
};

function wo(
  params: Partial<WorkOrder["data"]> & {
    docId: string;
    workOrderNumber: string;
    workCenterId: string;
    startDate: string;
    endDate: string;
    durationMinutes: number;
    isMaintenance: boolean;
    dependsOnWorkOrderIds: string[];
  },
): WorkOrder {
  return {
    docId: params.docId,
    docType: "workOrder",
    data: {
      manufacturingOrderId: "MO-1",
      ...params,
    },
  };
}

/**
 * Scenario 1: Delay cascade (A -> B -> C) where A duration increased.
 */
export const scenario1_delayCascade: ReflowInput = {
  workCenters: [wc1],
  workOrders: [
    wo({
      docId: "A",
      workOrderNumber: "A",
      workCenterId: "wc1",
      startDate: "2026-03-02T08:00:00Z",
      endDate: "2026-03-02T10:00:00Z",
      durationMinutes: 6 * 60, // DELAYED: 6 hours, will push others
      isMaintenance: false,
      dependsOnWorkOrderIds: [],
    }),
    wo({
      docId: "B",
      workOrderNumber: "B",
      workCenterId: "wc1",
      startDate: "2026-03-02T10:00:00Z",
      endDate: "2026-03-02T12:00:00Z",
      durationMinutes: 2 * 60,
      isMaintenance: false,
      dependsOnWorkOrderIds: ["A"],
    }),
    wo({
      docId: "C",
      workOrderNumber: "C",
      workCenterId: "wc1",
      startDate: "2026-03-02T12:00:00Z",
      endDate: "2026-03-02T14:00:00Z",
      durationMinutes: 2 * 60,
      isMaintenance: false,
      dependsOnWorkOrderIds: ["B"],
    }),
  ],
};

/**
 * Scenario 2: Shift spanning (starts near end of shift, continues next day)
 * 120 min starting 16:00; shift ends 17:00 -> 60 mins then next day 8:00-9:00
 */
export const scenario2_shiftSpanning: ReflowInput = {
  workCenters: [wc2],
  workOrders: [
    wo({
      docId: "S1",
      workOrderNumber: "S1",
      workCenterId: "wc2",
      startDate: "2026-03-02T16:00:00Z",
      endDate: "2026-03-02T18:00:00Z",
      durationMinutes: 120,
      isMaintenance: false,
      dependsOnWorkOrderIds: [],
    }),
  ],
};

/**
 * Scenario 3: Maintenance conflict + immovable maintenance WO
 * Maintenance window: 10:00-13:00; order wants 9:00-12:00 -> must pause & resume after 13:00
 */
export const scenario3_maintenanceConflict: ReflowInput = {
  workCenters: [wc1],
  workOrders: [
    // immovable maintenance work order occupying 08:30-09:30
    wo({
      docId: "M1",
      workOrderNumber: "M1",
      workCenterId: "wc1",
      startDate: "2026-03-03T08:30:00Z",
      endDate: "2026-03-03T09:30:00Z",
      durationMinutes: 60,
      isMaintenance: true,
      dependsOnWorkOrderIds: [],
    }),
    wo({
      docId: "P1",
      workOrderNumber: "P1",
      workCenterId: "wc1",
      startDate: "2026-03-03T09:00:00Z",
      endDate: "2026-03-03T12:00:00Z",
      durationMinutes: 180,
      isMaintenance: false,
      dependsOnWorkOrderIds: [],
    }),
  ],
};
