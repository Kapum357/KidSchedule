/**
 * KidSchedule – CustodyEngine
 *
 * ALGORITHM OVERVIEW
 * ─────────────────────────────────────────────────────────────────────────────
 * Co-parenting schedules are fundamentally a repeating cycle of continuous
 * "blocks" assigned to each parent.  The engine maps any calendar moment to
 * a block (and therefore a parent) without storing the entire custody
 * history.  It needs only:
 *
 *   1. An anchor moment – the exact timestamp when block[0] of the first
 *      cycle began.  This is immutable once set.
 *
 *   2. The schedule blocks – an ordered array of { parentId, days } that
 *      repeat cyclically.
 *
 *   3. The daily transition hour (0-23, default 17 = 5:00 PM).
 *
 * The core computation for "which block contains timestamp T":
 *
 *   cycleDurationMs  = sum(blocks.map(b => b.days)) × MS_PER_DAY
 *   positionMs       = safeMod(T − anchorMs, cycleDurationMs)
 *   blockIndex       = first i where prefix-sum(blocks[0..i].days) > positionMs
 *
 * This runs in O(B) where B = number of blocks in one cycle—constant for any
 * real-world schedule (typically 2–12 blocks).
 *
 * TRADE-OFFS
 * ─────────────────────────────────────────────────────────────────────────────
 * • Pure computation, no database reads.  All custody "history" is derived
 *   on the fly.  This means one-off swap changes are stored separately as
 *   CustodyOverride records and merged at query time (see applyOverrides()).
 *
 * • Integer milliseconds avoid floating-point drift over multi-year ranges.
 *
 * • The anchor + cycle approach is timezone-aware only to the extent that
 *   callers pass local (or UTC) timestamps consistently.  Apps should store
 *   the IANA timezone and convert before calling.
 */

import type {
  CustodySchedule,
  CustodyStatus,
  Family,
  Parent,
  ScheduleTransition,
} from "@/types";

/** Milliseconds per calendar day – used throughout */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * A modulo that always returns a non-negative result, even when `a` is
 * negative (i.e., query date is before anchor date).
 */
function safeMod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/**
 * Converts a schedule's blocks into an array of cumulative millisecond
 * thresholds from the start of the cycle.
 *
 * Example – 2-2-3 pattern (days: [2, 2, 3]):
 *   [172_800_000, 345_600_000, 604_800_000]
 *              ↑ 2d            ↑ 4d          ↑ 7d
 */
function buildThresholds(blocks: CustodySchedule["blocks"]): number[] {
  const thresholds: number[] = [];
  let accumulated = 0;
  for (const block of blocks) {
    accumulated += block.days * MS_PER_DAY;
    thresholds.push(accumulated);
  }
  return thresholds;
}

// ─── Block Resolution ─────────────────────────────────────────────────────────

interface BlockPosition {
  /** 0-based index into schedule.blocks */
  blockIndex: number;
  /** Absolute timestamp (ms) when this block started */
  blockStartMs: number;
  /** Absolute timestamp (ms) when this block ends / next block begins */
  blockEndMs: number;
}

/**
 * Given any timestamp, resolve which schedule block is active and the
 * precise start/end timestamps of that block occurrence.
 *
 * Complexity: O(B) where B = blocks.length (typically ≤ 12).
 */
function resolveBlock(
  atMs: number,
  anchorMs: number,
  schedule: CustodySchedule,
  thresholds: number[]
): BlockPosition {
  const cycleDurationMs = thresholds.at(-1)!;
  const positionMs = safeMod(atMs - anchorMs, cycleDurationMs);

  // Which cycle number are we in?  (Can be negative for pre-anchor dates.)
  const cycleOffset =
    Math.floor((atMs - anchorMs) / cycleDurationMs) * cycleDurationMs;
  const cycleStartMs = anchorMs + cycleOffset;

  // Walk block thresholds until we find the one containing positionMs.
  let blockIndex = 0;
  let blockStartMs = cycleStartMs;

  for (let i = 0; i < thresholds.length; i++) {
    const blockEndMs = cycleStartMs + thresholds[i];
    if (positionMs < thresholds[i]) {
      blockIndex = i;
      blockStartMs = i === 0 ? cycleStartMs : cycleStartMs + thresholds[i - 1];
      return { blockIndex, blockStartMs, blockEndMs };
    }
  }

  // Fallback: should be unreachable given safeMod guarantees.
  return {
    blockIndex: 0,
    blockStartMs: cycleStartMs,
    blockEndMs: cycleStartMs + thresholds[0],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export class CustodyEngine {
  private readonly family: Family;
  private readonly schedule: CustodySchedule;
  private readonly anchorMs: number;
  private readonly thresholds: number[];
  private readonly parentMap: Map<string, Parent>;

  /**
   * @param family  Complete family record including both parents and schedule.
   *
   * The anchor timestamp is derived from `family.custodyAnchorDate` treated as
   * a local calendar date at the schedule's `transitionHour`.  Callers MUST
   * ensure all Date objects passed to public methods use the same timezone.
   */
  constructor(family: Family) {
    this.family = family;
    this.schedule = family.schedule;

    // Build anchor: the moment block[0] first became active.
    // Parse the ISO date to midnight UTC, then shift to local transition hour.
    const [year, month, day] = family.custodyAnchorDate
      .split("-")
      .map(Number) as [number, number, number];
    const anchorDate = new Date(year, month - 1, day, this.schedule.transitionHour, 0, 0, 0);
    this.anchorMs = anchorDate.getTime();

    this.thresholds = buildThresholds(this.schedule.blocks);

    // Index parents for O(1) lookup by id.
    this.parentMap = new Map<string, Parent>(
      family.parents.map((p) => [p.id, p])
    );
  }

  // ── Core Query Methods ───────────────────────────────────────────────────

  /**
   * Returns the full custody status at the given moment (defaults to now).
   *
   * @example
   * const engine = new CustodyEngine(family);
   * const status = engine.getStatus();
   * console.log(`${status.currentParent.name} has custody.`);
   * console.log(`Next transition in ${status.minutesUntilTransition} minutes.`);
   */
  getStatus(at: Date = new Date()): CustodyStatus {
    const atMs = at.getTime();
    const pos = resolveBlock(atMs, this.anchorMs, this.schedule, this.thresholds);
    const block = this.schedule.blocks[pos.blockIndex];
    const parent = this.parentMap.get(block.parentId);

    if (!parent) {
      throw new Error(
        `CustodyEngine: parentId "${block.parentId}" not found in family.parents`
      );
    }

    const minutesUntilTransition = Math.max(
      0,
      Math.floor((pos.blockEndMs - atMs) / 60_000)
    );

    return {
      currentParent: parent,
      periodStart: new Date(pos.blockStartMs),
      periodEnd: new Date(pos.blockEndMs),
      minutesUntilTransition,
    };
  }

  /**
   * Returns the next N custody transitions after the given moment.
   *
   * Iterates through successive block boundaries – O(N × B) where B is
   * blocks.length.  For typical N ≤ 30 and B ≤ 12 this is negligible.
   *
   * @param count  How many upcoming transitions to return (default 5).
   */
  getUpcomingTransitions(at: Date = new Date(), count = 5): ScheduleTransition[] {
    const transitions: ScheduleTransition[] = [];
    let curMs = at.getTime();

    for (let i = 0; i < count; i++) {
      const current = resolveBlock(curMs, this.anchorMs, this.schedule, this.thresholds);
      const fromBlock = this.schedule.blocks[current.blockIndex];
      const nextBlockIndex = (current.blockIndex + 1) % this.schedule.blocks.length;
      const toBlock = this.schedule.blocks[nextBlockIndex];

      const fromParent = this.parentMap.get(fromBlock.parentId);
      const toParent = this.parentMap.get(toBlock.parentId);

      if (!fromParent || !toParent) {
        throw new Error("CustodyEngine: invalid parentId in schedule blocks");
      }

      transitions.push({
        at: new Date(current.blockEndMs),
        fromParent,
        toParent,
      });

      // Advance past this transition to find the next one.
      curMs = current.blockEndMs + 1;
    }

    return transitions;
  }

  /**
   * Returns every transition that falls within [rangeStart, rangeEnd].
   *
   * Useful for populating a month view on the calendar.
   *
   * Complexity: O((rangeMs / MS_PER_DAY) × (1/avgBlockDays)) – proportional
   * to the number of transitions in the range, which is bounded by the
   * calendar range requested.
   */
  getTransitionsInRange(rangeStart: Date, rangeEnd: Date): ScheduleTransition[] {
    const transitions: ScheduleTransition[] = [];
    let curMs = rangeStart.getTime();
    const endMs = rangeEnd.getTime();

    while (curMs <= endMs) {
      const pos = resolveBlock(curMs, this.anchorMs, this.schedule, this.thresholds);
      const transitionMs = pos.blockEndMs;

      if (transitionMs > endMs) break;

      const fromBlock = this.schedule.blocks[pos.blockIndex];
      const nextIndex = (pos.blockIndex + 1) % this.schedule.blocks.length;
      const toBlock = this.schedule.blocks[nextIndex];

      const fromParent = this.parentMap.get(fromBlock.parentId);
      const toParent = this.parentMap.get(toBlock.parentId);

      if (!fromParent || !toParent) break;

      transitions.push({ at: new Date(transitionMs), fromParent, toParent });

      // Advance to just after this transition.
      curMs = transitionMs + 1;
    }

    return transitions;
  }

  /**
   * Calculates each parent's custody percentage over a given window.
   *
   * Returns a map from parentId → percentage (0–100, two decimal places).
   * All percentages sum to 100.
   *
   * Complexity: O(B) – one pass over the schedule blocks.
   */
  getCustodyPercentages(): Record<string, number> {
    const cycleDays = this.schedule.blocks.reduce((s, b) => s + b.days, 0);
    const daysByParent: Record<string, number> = {};

    for (const block of this.schedule.blocks) {
      daysByParent[block.parentId] =
        (daysByParent[block.parentId] ?? 0) + block.days;
    }

    const result: Record<string, number> = {};
    for (const [parentId, days] of Object.entries(daysByParent)) {
      result[parentId] = Math.round((days / cycleDays) * 10_000) / 100;
    }
    return result;
  }

  /**
   * Determines which parent has custody on every day in a month.
   *
   * Returns a  Map<"YYYY-MM-DD" string, Parent> for fast calendar rendering.
   *
   * Complexity: O(D × B) where D = days in month ≤ 31.
   */
  getMonthCustodyMap(year: number, month: number): Map<string, Parent> {
    const map = new Map<string, Parent>();
    const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-based

    for (let d = 1; d <= daysInMonth; d++) {
      // Query at noon local time to avoid DST boundary issues.
      const queryDate = new Date(year, month - 1, d, 12, 0, 0, 0);
      const status = this.getStatus(queryDate);
      const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      map.set(key, status.currentParent);
    }

    return map;
  }
}

// ─── Factory Helpers ──────────────────────────────────────────────────────────

/**
 * Built-in schedule presets so callers don't have to construct blocks by hand.
 *
 * @param parentAId  ID of the parent who holds the first block.
 * @param parentBId  ID of the other parent.
 */
export const SchedulePresets = {
  /** Classic alternating full weeks.  7-day cycle. */
  alternatingWeeks(parentAId: string, parentBId: string): CustodySchedule["blocks"] {
    return [
      { parentId: parentAId, days: 7, label: "Week A" },
      { parentId: parentBId, days: 7, label: "Week B" },
    ];
  },

  /**
   * 2-2-3 rotation – popular because each parent gets every other weekend.
   * 14-day cycle.
   */
  twoTwoThree(parentAId: string, parentBId: string): CustodySchedule["blocks"] {
    return [
      { parentId: parentAId, days: 2, label: "Mon–Tue A" },
      { parentId: parentBId, days: 2, label: "Wed–Thu B" },
      { parentId: parentAId, days: 3, label: "Fri–Sun A" },
      { parentId: parentBId, days: 2, label: "Mon–Tue B" },
      { parentId: parentAId, days: 2, label: "Wed–Thu A" },
      { parentId: parentBId, days: 3, label: "Fri–Sun B" },
    ];
  },

  /**
   * 3-4-4-3 rotation.  14-day cycle.
   */
  threeFourFourThree(parentAId: string, parentBId: string): CustodySchedule["blocks"] {
    return [
      { parentId: parentAId, days: 3, label: "3 days A" },
      { parentId: parentBId, days: 4, label: "4 days B" },
      { parentId: parentAId, days: 4, label: "4 days A" },
      { parentId: parentBId, days: 3, label: "3 days B" },
    ];
  },
} as const;
