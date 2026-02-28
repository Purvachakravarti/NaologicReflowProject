import { DateTime } from "luxon";
import { Shift } from "../reflow/types";
import { Interval, pushOutOfBlocked, sortIntervals } from "./interval-utils";

/**
 * Build shift interval for the day of `day` (in UTC).
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
 * If cursor is during a working shift -> returns that shift window.
 * Else -> returns next shift window in future.
 */
export function findNextShiftWindow(
  cursor: DateTime,
  shifts: Shift[],
): Interval {
  if (shifts.length === 0) {
    throw new Error("No shifts defined for work center.");
  }

  // We search up to 14 days ahead to avoid infinite loops
  for (let d = 0; d < 14; d++) {
    const day = cursor.plus({ days: d }).startOf("day");
    const dow = day.weekday % 7; // Luxon weekday: Mon=1..Sun=7; convert to 0..6 with Sun=0

    const dayShifts = shifts
      .filter((s) => s.dayOfWeek === dow)
      .map((s) => shiftIntervalForDay(day, s))
      .sort((a, b) => a.start.toMillis() - b.start.toMillis());

    if (dayShifts.length === 0) continue;

    // If we're checking current day (d==0), consider cursor position
    if (d === 0) {
      for (const w of dayShifts) {
        if (cursor < w.end) {
          // If cursor is before shift start, snap to shift start
          return { start: cursor < w.start ? w.start : cursor, end: w.end };
        }
      }
    } else {
      // future day: take first shift window fully
      const w = dayShifts[0];
      return { start: w.start, end: w.end };
    }
  }

  throw new Error("No shift window found in search horizon.");
}

/**
 * Allocate `durationMinutes` starting from `startISO` within shift windows,
 * skipping blocked intervals (maintenance + already scheduled orders).
 * Returns { start, end } ISO strings.
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

  // Ensure we start outside blocked time
  cursor = pushOutOfBlocked(cursor, blockedSorted);

  const scheduledStart = cursor;

  while (remaining > 0) {
    // Find next available shift window
    const shiftWindow = findNextShiftWindow(cursor, params.shifts);

    // Move out of blocked if cursor sits inside blocked
    cursor = pushOutOfBlocked(cursor, blockedSorted);

    // If we got pushed beyond shift end, loop to find next shift
    if (cursor >= shiftWindow.end) {
      cursor = shiftWindow.end.plus({ minutes: 1 }); // nudge forward
      continue;
    }

    // Work can only happen within shiftWindow.end
    const shiftEnd = shiftWindow.end;

    // But maintenance/booking may cut into it: find the next blocked interval after cursor
    let nextBlockStart: DateTime | null = null;
    let nextBlockEnd: DateTime | null = null;

    for (const b of blockedSorted) {
      if (b.end <= cursor) continue;
      if (b.start >= shiftEnd) break;
      // first relevant block
      nextBlockStart = b.start;
      nextBlockEnd = b.end;
      break;
    }

    // Compute free segment end: min(shiftEnd, nextBlockStart)
    const freeEnd =
      nextBlockStart && nextBlockStart > cursor
        ? nextBlockStart < shiftEnd
          ? nextBlockStart
          : shiftEnd
        : shiftEnd;

    if (freeEnd <= cursor) {
      // cursor is at/after freeEnd; maybe due to block starting now
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

    const used = Math.min(remaining, freeMinutes);
    remaining -= used;
    cursor = cursor.plus({ minutes: used });

    // If we still have work left and we're inside a block or out of shift, loop will find next segment
    cursor = pushOutOfBlocked(cursor, blockedSorted);
  }

  return { startISO: scheduledStart.toISO()!, endISO: cursor.toISO()! };
}
