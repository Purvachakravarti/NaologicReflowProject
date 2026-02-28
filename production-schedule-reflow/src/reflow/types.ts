export type ISODateString = string;

export interface DocumentBase<TDocType extends string, TData> {
  docId: string;
  docType: TDocType;
  data: TData;
}

export interface WorkOrderData {
  workOrderNumber: string;
  manufacturingOrderId: string;
  workCenterId: string;

  // Timing (ISO UTC)
  startDate: ISODateString;
  endDate: ISODateString;

  durationMinutes: number;

  isMaintenance: boolean;

  dependsOnWorkOrderIds: string[];

  // Optional bonus
  setupTimeMinutes?: number;
}

export type WorkOrder = DocumentBase<"workOrder", WorkOrderData>;

export interface Shift {
  dayOfWeek: number; // 0-6, Sunday=0
  startHour: number; // 0-23
  endHour: number; // 0-23
}

export interface MaintenanceWindow {
  startDate: ISODateString;
  endDate: ISODateString;
  reason?: string;
}

export interface WorkCenterData {
  name: string;
  shifts: Shift[];
  maintenanceWindows: MaintenanceWindow[];
}

export type WorkCenter = DocumentBase<"workCenter", WorkCenterData>;

export interface ManufacturingOrderData {
  manufacturingOrderNumber: string;
  itemId: string;
  quantity: number;
  dueDate: ISODateString;
}

export type ManufacturingOrder = DocumentBase<
  "manufacturingOrder",
  ManufacturingOrderData
>;

export interface ReflowInput {
  workOrders: WorkOrder[];
  workCenters: WorkCenter[];
  manufacturingOrders?: ManufacturingOrder[];
}

export interface Change {
  workOrderId: string;
  workOrderNumber: string;
  reason: string;
  oldStart: ISODateString;
  newStart: ISODateString;
  oldEnd: ISODateString;
  newEnd: ISODateString;
  deltaMinutes: number;
}

export interface ReflowResult {
  updatedWorkOrders: WorkOrder[];
  changes: Change[];
  explanation: string[];
  metrics?: {
    totalDelayMinutes: number;
    movedCount: number;
  };
}
