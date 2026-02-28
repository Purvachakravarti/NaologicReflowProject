import { ReflowService } from "../reflow/reflow.service";
import {
  scenario1_delayCascade,
  scenario2_shiftSpanning,
  scenario3_maintenanceConflict,
} from "../sample-data/scenarios";
import {
  validateNoWorkCenterOverlaps,
  validateMaintenanceRespected,
} from "../reflow/constraint-checker";

describe("Production schedule reflow", () => {
  test("Scenario 1: delay cascade pushes downstream dependencies", () => {
    const service = new ReflowService();
    const result = service.reflow(scenario1_delayCascade);

    const A = result.updatedWorkOrders.find((w) => w.docId === "A")!;
    const B = result.updatedWorkOrders.find((w) => w.docId === "B")!;
    const C = result.updatedWorkOrders.find((w) => w.docId === "C")!;

    expect(B.data.startDate >= A.data.endDate).toBe(true);
    expect(C.data.startDate >= B.data.endDate).toBe(true);
  });

  test("Scenario 2: shift spanning pauses and resumes next day", () => {
    const service = new ReflowService();
    const result = service.reflow(scenario2_shiftSpanning);

    const S1 = result.updatedWorkOrders.find((w) => w.docId === "S1")!;
    // Ends next day because it starts at 16:00 and needs 120 working minutes (60 today + 60 next day)
    expect(S1.data.endDate.startsWith("2026-03-03")).toBe(true);
  });

  test("Scenario 3: maintenance conflict is respected and no overlaps exist", () => {
    const service = new ReflowService();
    const result = service.reflow(scenario3_maintenanceConflict);

    // Hard constraints should hold
    validateNoWorkCenterOverlaps(result.updatedWorkOrders);
    validateMaintenanceRespected(
      result.updatedWorkOrders,
      scenario3_maintenanceConflict.workCenters,
    );
  });
});
