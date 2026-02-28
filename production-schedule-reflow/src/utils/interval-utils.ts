import { DateTime } from "luxon";

export interface Interval {
  start: DateTime; // inclusive
  end: DateTime; // exclusive
  reason?: string;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function sortIntervals(intervals: Interval[]): Interval[] {
  return intervals
    .slice()
    .sort((x, y) => x.start.toMillis() - y.start.toMillis());
}

/**
 * Given a cursor time, if it's inside any blocked interval, return the end of that interval.
 * If not blocked, return cursor unchanged.
 */
export function pushOutOfBlocked(
  cursor: DateTime,
  blocked: Interval[],
): DateTime {
  for (const b of blocked) {
    if (cursor >= b.start && cursor < b.end) {
      return b.end;
    }
  }
  return cursor;
}
