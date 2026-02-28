import { ReflowService } from "./reflow/reflow.service";
import {
  scenario1_delayCascade,
  scenario2_shiftSpanning,
  scenario3_maintenanceConflict,
} from "./sample-data/scenarios";

function run(name: string, input: any) {
  console.log("\n==============================");
  console.log(`SCENARIO: ${name}`);
  console.log("==============================");

  const service = new ReflowService();
  const result = service.reflow(input);

  console.log("\nChanges:");
  for (const c of result.changes) {
    console.log(
      `- ${c.workOrderNumber}: ${c.oldStart} -> ${c.newStart} | ${c.oldEnd} -> ${c.newEnd} | Δ ${c.deltaMinutes} min`,
    );
  }

  console.log("\nUpdated Work Orders:");
  for (const wo of result.updatedWorkOrders) {
    console.log(
      `- ${wo.data.workOrderNumber} [${wo.data.workCenterId}] ${wo.data.startDate} -> ${wo.data.endDate} (dur=${wo.data.durationMinutes}m maint=${wo.data.isMaintenance})`,
    );
  }

  console.log("\nExplanation:");
  for (const line of result.explanation) console.log(`- ${line}`);

  if (result.metrics) {
    console.log("\nMetrics:");
    console.log(result.metrics);
  }
}

run("1) Delay Cascade", scenario1_delayCascade);
run("2) Shift Spanning", scenario2_shiftSpanning);
run(
  "3) Maintenance Conflict + Locked Maintenance WO",
  scenario3_maintenanceConflict,
);
