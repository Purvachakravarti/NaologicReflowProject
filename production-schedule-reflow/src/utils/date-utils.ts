// src/utils/date-utils.ts
import { DateTime } from "luxon";
import { Shift } from "../reflow/types";
import { Interval, pushOutOfBlocked, sortIntervals } from "./interval-utils";

/**
 * Build a shift interval for a specific day (UTC).
 */
function shiftIntervalForDay(day: DateTime, shift: Shift): Interval {
  const start = day.set({
    hour: shift.startHour,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  const end = day.set({
    hour: shift.endHour,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  return { start, end };
}

/**
 * Find the next shift window that contains or follows the cursor.
 * - If cursor is during a shift -> returns window [max(cursor, shiftStart), shiftEnd)
 * - Else -> returns next shift window in the future
 */
export function findNextShiftWindow(
  cursor: DateTime,
  shifts: Shift[],
): Interval {
  if (shifts.length === 0) {
    throw new Error("No shifts defined for work center.");
  }

  // Search horizon (defensive): 14 days
  for (let d = 0; d < 14; d++) {
    const day = cursor.plus({ days: d }).startOf("day");
    const dow = day.weekday % 7; // Luxon: Mon=1..Sun=7 -> 0..6 with Sun=0

    const dayWindows = shifts
      .filter((s) => s.dayOfWeek === dow)
      .map((s) => shiftIntervalForDay(day, s))
      .sort((a, b) => a.start.toMillis() - b.start.toMillis());

    if (dayWindows.length === 0) continue;

    if (d === 0) {
      // Same day: return first window whose end is after cursor
      for (const w of dayWindows) {
        if (cursor < w.end) {
          return { start: cursor < w.start ? w.start : cursor, end: w.end };
        }
      }
      // cursor after all shifts today -> continue to next day
    } else {
      // Future day: return first shift window
      return { start: dayWindows[0].start, end: dayWindows[0].end };
    }
  }

  throw new Error("No shift window found in search horizon.");
}

/**
 * Allocate `durationMinutes` starting from `startISO` within shift windows,
 * skipping blocked intervals (maintenance + already scheduled orders).
 *
 * Returns an elapsed start and end time (ISO UTC). The elapsed span may cross
 * non-working or blocked periods because work pauses and resumes.
 */
export function scheduleWithShiftsAndBlocks(params: {
  startISO: string;
  durationMinutes: number;
  shifts: Shift[];
  blocked: Interval[]; // maintenance + existing bookings
}): { startISO: string; endISO: string } {
  let cursor = DateTime.fromISO(params.startISO, { zone: "utc" });
  let remaining = params.durationMinutes;

  const blockedSorted = sortIntervals(params.blocked);

  // Ensure initial cursor is not inside blocked time
  cursor = pushOutOfBlocked(cursor, blockedSorted);

  // The scheduled start is the first time we can actually begin work (may be moved by constraints)
  let scheduledStart: DateTime | null = null;

  while (remaining > 0) {
    // 1) Find next available shift window (may begin in the future)
    const shiftWindow = findNextShiftWindow(cursor, params.shifts);

    // 2) Hard clamp cursor to shift start (CRITICAL to prevent "working" outside shifts)
    if (cursor < shiftWindow.start) cursor = shiftWindow.start;

    // 3) Push out of blocked time; then clamp again to shift start (in case we moved backward logically)
    cursor = pushOutOfBlocked(cursor, blockedSorted);
    if (cursor < shiftWindow.start) cursor = shiftWindow.start;

    // 4) If we're past the shift end, advance and loop
    if (cursor >= shiftWindow.end) {
      cursor = shiftWindow.end.plus({ minutes: 1 });
      continue;
    }

    // Record the real scheduled start once (first time we actually can work)
    if (!scheduledStart) scheduledStart = cursor;

    // 5) Find the next block that could cut the current shift segment
    const shiftEnd = shiftWindow.end;

    let nextBlockStart: DateTime | null = null;
    let nextBlockEnd: DateTime | null = null;

    for (const b of blockedSorted) {
      if (b.end <= cursor) continue; // block entirely before cursor
      if (b.start >= shiftEnd) break; // blocks after shift end don't matter now
      nextBlockStart = b.start;
      nextBlockEnd = b.end;
      break;
    }

    // 6) Compute the free segment end: min(shiftEnd, nextBlockStart (if in future))
    const freeEnd =
      nextBlockStart && nextBlockStart > cursor
        ? nextBlockStart < shiftEnd
          ? nextBlockStart
          : shiftEnd
        : shiftEnd;

    if (freeEnd <= cursor) {
      // No usable free time; likely block starts at cursor
      if (nextBlockEnd) {
        cursor = nextBlockEnd;
        continue;
      }
      cursor = shiftEnd.plus({ minutes: 1 });
      continue;
    }

    const freeMinutes = Math.floor(freeEnd.diff(cursor, "minutes").minutes);
    if (freeMinutes <= 0) {
      cursor = freeEnd.plus({ minutes: 1 });
      continue;
    }

    // 7) Consume working minutes
    const used = Math.min(remaining, freeMinutes);
    remaining -= used;
    cursor = cursor.plus({ minutes: used });

    // 8) If we landed inside blocked time, push out and keep going
    cursor = pushOutOfBlocked(cursor, blockedSorted);
  }

  // If durationMinutes was 0, define start=end at cursor
  if (!scheduledStart)
    scheduledStart = DateTime.fromISO(params.startISO, { zone: "utc" });

  return {
    startISO: scheduledStart.toISO()!,
    endISO: cursor.toISO()!,
  };
}
