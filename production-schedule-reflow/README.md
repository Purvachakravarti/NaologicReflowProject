# Production Schedule Reflow (Naologic BE Take-Home)

## Overview

This project implements a production schedule **reflow algorithm** for a manufacturing facility.  
When disruptions occur (delays, breakdowns, maintenance), it reschedules work orders while respecting:

- Dependencies (A must finish before B)
- Work center capacity (no overlaps)
- Shift boundaries (work pauses outside shifts)
- Maintenance windows (blocked time)
- Maintenance work orders are immovable

All dates are treated as **UTC ISO strings**.

## Tech

- TypeScript (strict)
- Luxon (date/time in UTC)

## How to run

```bash
node -v
npm -v

npm init -y

npm install luxon
npm install -D typescript ts-node-dev @types/node @types/luxon

npx tsc --init
npm run dev
```

## Algorithm (High-level)

Build a dependency graph of work orders.

Topologically sort (cycle detection included).

For each work order in topo order:

If maintenance work order: keep fixed, add as booked interval.

Else:

Compute earliest start = max(originalStart, latestParentEnd).

Schedule required working minutes inside shift windows, skipping:

maintenance windows

existing bookings on the work center

Output updated schedule + list of changes + explanation + metrics.

Scenarios

src/sample-data/scenarios.ts includes:

Delay cascade (A -> B -> C)

Shift spanning (pause/resume across shifts)

Maintenance conflict + immovable maintenance work order

### In the terminal:

You’ll see all 3 scenarios printed with:

what changed

updated start/end

explanation

metrics
