# Production Schedule Reflow (Naologic BE Take-Home)

## Overview

This project implements a production schedule **reflow algorithm** for a manufacturing facility.
When disruptions occur (delays, breakdowns, maintenance), it reschedules work orders while respecting:

- **Dependencies** (A must finish before B; multiple parents supported)
- **Work center capacity** (no overlaps per work center)
- **Shift boundaries** (work pauses outside shifts and resumes next shift)
- **Maintenance windows** (blocked time periods)
- **Maintenance work orders** are **immovable** (locked in place)

All timestamps are treated as **UTC ISO strings**.

## Tech

- TypeScript (strict)
- Luxon (UTC date/time)

## How to run

### Prerequisites

- Node.js + npm installed

### Install

npm install

## Run (dev)

npm run dev

## Run tests (bonus)

npm test
Build + run compiled output
npm run build
npm start

## Project structure

src/
reflow/
types.ts # Domain types
dag.ts # Topological sort + cycle detection
constraint-checker.ts # Validation helpers
reflow.service.ts # Main orchestration logic
utils/
interval-utils.ts # Interval helpers
date-utils.ts # Shift + blocked-time scheduling engine
sample-data/
scenarios.ts # 3 demo scenarios
index.ts # CLI runner
prompts/
ai-prompts.md # AI prompts used (bonus)

### Algorithm (high-level)

1. Build a dependency graph of work orders.

2. Topologically sort it (cycle detection included).

3. Maintain blocked intervals per work center:
   - maintenance windows
   - already scheduled work orders
   - locked (immovable) maintenance work orders

4. For each work order in topo order:
   - If isMaintenance === true: keep fixed and add it to blocked intervals.
   - Else:
     => Compute earliestStart = max(originalStart, latestParentEnd).
     => Allocate required working minutes inside shift windows while skipping blocked intervals.

5. Return:
   - updated schedule
   - list of changes
   - explanation
   - simple metrics (total delay minutes, moved count)

## Scenarios

src/sample-data/scenarios.ts includes:

1. Delay cascade (A → B → C)

2. Shift spanning (pause/resume across shift boundary)

3. Maintenance conflict + locked maintenance work order

When you run npm run dev, the CLI prints:

1. changes (before/after timestamps + delta)

2. updated work orders

3. explanation

4. metrics

### Notes / Trade-offs

- Single-interval representation: each work order is represented as a single elapsed [startDate, endDate].
  This guarantees a valid schedule and simplifies conflict checking.
  @upgrade: return work segments (actual working intervals) to allow interleaving during pauses and to validate “no work during maintenance” at segment level.

- This is a deterministic forward scheduler, not an optimization solver.
  @upgrade: add objective functions (minimize total delay, minimize number of moved orders, maximize utilization).
