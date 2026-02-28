import { WorkOrder } from "./types";

export function topoSortWorkOrders(workOrders: WorkOrder[]): string[] {
  const nodes = new Set(workOrders.map((w) => w.docId));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of nodes) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const wo of workOrders) {
    for (const parentId of wo.data.dependsOnWorkOrderIds) {
      if (!nodes.has(parentId)) {
        throw new Error(
          `Dependency references missing work order: ${parentId}`,
        );
      }
      adj.get(parentId)!.push(wo.docId);
      inDegree.set(wo.docId, (inDegree.get(wo.docId) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const result: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    result.push(id);

    for (const child of adj.get(id)!) {
      inDegree.set(child, (inDegree.get(child) ?? 0) - 1);
      if (inDegree.get(child) === 0) queue.push(child);
    }
  }

  if (result.length !== workOrders.length) {
    throw new Error("Circular dependency detected (graph is not a DAG).");
  }

  return result;
}
