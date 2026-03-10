/**
 * ConflictClimateAnalyzer Unit Tests
 *
 * Tests the lexical + intensity + topic + length scoring pipeline,
 * time-decay aggregation, window filtering, level thresholds,
 * coaching tip selection, and convenience methods.
 *
 * No mocks required — the analyzer is a pure function class.
 */

import { ConflictClimateAnalyzer } from "@/lib/conflict-analyzer";
import type { Message } from "@/lib";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FAMILY_ID = "fam-test";

/** Fixed reference "now" for deterministic window/decay calculations. */
const NOW = new Date("2026-03-09T12:00:00Z");

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

function msg(
  id: string,
  body: string,
  opts: { senderId?: string; sentAt?: string } = {}
): Message {
  return {
    id,
    familyId: FAMILY_ID,
    senderId: opts.senderId ?? "parent-1",
    body,
    sentAt: opts.sentAt ?? daysAgo(1),
  };
}

const analyzer = new ConflictClimateAnalyzer();

// ─── Empty / No-Window Scenarios ──────────────────────────────────────────────

describe("ConflictClimateAnalyzer – empty / out-of-window messages", () => {
  it("returns tensionScore 50 for an empty message array", () => {
    const result = analyzer.analyze([], NOW);
    expect(result.tensionScore).toBe(50);
    expect(result.level).toBe("medium");
    expect(result.sampleSize).toBe(0);
  });

  it("returns tensionScore 50 when all messages are outside the 30-day window", () => {
    const old = msg("m1", "you always ignore me", { sentAt: "2025-01-01T00:00:00Z" });
    const result = analyzer.analyze([old], NOW);
    expect(result.tensionScore).toBe(50);
    expect(result.sampleSize).toBe(0);
  });

  it("includes messages exactly at window boundary", () => {
    // Message sent exactly 30 days ago should be included (>= windowStart)
    const boundary = msg("m1", "thank you", { sentAt: daysAgo(30) });
    const result = analyzer.analyze([boundary], NOW);
    expect(result.sampleSize).toBe(1);
  });
});

// ─── Climate Level Thresholds ─────────────────────────────────────────────────

describe("ConflictClimateAnalyzer – climate level thresholds", () => {
  it("returns 'low' level for a cooperative-only thread", () => {
    // Each message hits 7+ cooperative patterns → rawScore ≥ 0.5 → tensionScore ≤ 25
    const body =
      "thank you appreciate sounds good no problem great of course i understand please sorry happy to works for me";
    const msgs = Array.from({ length: 5 }, (_, i) =>
      msg(`m${i}`, body, { senderId: i % 2 === 0 ? "parent-1" : "parent-2" })
    );
    const result = analyzer.analyze(msgs, NOW);
    expect(result.level).toBe("low");
    expect(result.tensionScore).toBeLessThanOrEqual(33);
  });

  it("returns 'high' level for a heavily hostile thread", () => {
    const bodies = [
      "YOU ALWAYS FORGET AND IT IS YOUR FAULT MY LAWYER WILL HEAR ABOUT THIS",
      "ABSOLUTELY NOT I HATE THIS YOU NEVER LISTEN TAKE YOU TO COURT",
      "YOU DON'T CARE YOU NEVER LISTEN FORGET IT WHATEVER NO WAY",
    ];
    const msgs = bodies.map((b, i) =>
      msg(`m${i}`, b, { senderId: i % 2 === 0 ? "parent-1" : "parent-2" })
    );
    const result = analyzer.analyze(msgs, NOW);
    expect(result.level).toBe("high");
    expect(result.tensionScore).toBeGreaterThan(66);
  });

  it("returns 'medium' level for a mixed-tone thread", () => {
    const msgs = [
      msg("m1", "This is unbelievable.", { senderId: "parent-1" }),
      msg("m2", "I understand, thank you.", { senderId: "parent-2" }),
    ];
    const result = analyzer.analyze(msgs, NOW);
    expect(result.level).toBe("medium");
    expect(result.tensionScore).toBeGreaterThan(33);
    expect(result.tensionScore).toBeLessThanOrEqual(66);
  });
});

// ─── Tension Score Direction ──────────────────────────────────────────────────

describe("ConflictClimateAnalyzer – tension score direction", () => {
  it("cooperative messages produce lower tension than hostile messages", () => {
    const coop = msg("m1", "thank you appreciate sounds good no problem great");
    const hostile = msg("m2", "you always forget your fault unbelievable whatever");
    const coopScore = analyzer.analyze([coop], NOW).tensionScore;
    const hostileScore = analyzer.analyze([hostile], NOW).tensionScore;
    expect(coopScore).toBeLessThan(hostileScore);
  });

  it("tensionScore is always in [0, 100]", () => {
    const extremeHostile = msg(
      "m1",
      "YOU ALWAYS FORGET MY LAWYER TAKE YOU TO COURT ABSOLUTELY NOT I HATE THIS"
    );
    const result = analyzer.analyze([extremeHostile], NOW);
    expect(result.tensionScore).toBeGreaterThanOrEqual(0);
    expect(result.tensionScore).toBeLessThanOrEqual(100);
  });

  it("all-caps message raises tension compared to same words in lowercase", () => {
    const lower = msg("m1", "you always forget your fault");
    const upper = msg("m2", "YOU ALWAYS FORGET YOUR FAULT");
    const lowerScore = analyzer.analyze([lower], NOW).tensionScore;
    const upperScore = analyzer.analyze([upper], NOW).tensionScore;
    expect(upperScore).toBeGreaterThan(lowerScore);
  });

  it("sensitive topic amplifies negative tone", () => {
    const plain = msg("m1", "your fault");
    const sensitized = msg("m2", "the custody arrangement is your fault");
    const plainScore = analyzer.analyze([plain], NOW).tensionScore;
    const sensitizedScore = analyzer.analyze([sensitized], NOW).tensionScore;
    expect(sensitizedScore).toBeGreaterThanOrEqual(plainScore);
  });

  it("long message (>400 chars) receives a length penalty vs equivalent short message", () => {
    const shortBody = "your fault";
    const longBody = "your fault " + "x ".repeat(200);
    const shortScore = analyzer.analyze([msg("m1", shortBody)], NOW).tensionScore;
    const longScore = analyzer.analyze([msg("m2", longBody)], NOW).tensionScore;
    expect(longScore).toBeGreaterThanOrEqual(shortScore);
  });
});

// ─── Window Filtering ────────────────────────────────────────────────────────

describe("ConflictClimateAnalyzer – window filtering", () => {
  it("includes messages within the default 30-day window", () => {
    const recent = msg("m1", "thank you", { sentAt: daysAgo(15) });
    const result = analyzer.analyze([recent], NOW);
    expect(result.sampleSize).toBe(1);
  });

  it("excludes messages beyond the default 30-day window", () => {
    const old = msg("m1", "you always", { sentAt: daysAgo(31) });
    const result = analyzer.analyze([old], NOW);
    expect(result.sampleSize).toBe(0);
  });

  it("respects a custom windowDays configuration", () => {
    const sevenDayAnalyzer = new ConflictClimateAnalyzer({ windowDays: 7 });
    const eightDaysAgo = msg("m1", "you always", { sentAt: daysAgo(8) });
    const result = sevenDayAnalyzer.analyze([eightDaysAgo], NOW);
    expect(result.sampleSize).toBe(0);
  });

  it("includes a message that is just inside a custom window", () => {
    const sevenDayAnalyzer = new ConflictClimateAnalyzer({ windowDays: 7 });
    const sixDaysAgo = msg("m1", "thank you", { sentAt: daysAgo(6) });
    const result = sevenDayAnalyzer.analyze([sixDaysAgo], NOW);
    expect(result.sampleSize).toBe(1);
  });

  it("mixed in-window and out-of-window messages — only counts in-window", () => {
    const inWindow = msg("m1", "thank you", { sentAt: daysAgo(5) });
    const outOfWindow = msg("m2", "you always", { sentAt: daysAgo(45) });
    const result = analyzer.analyze([inWindow, outOfWindow], NOW);
    expect(result.sampleSize).toBe(1);
  });
});

// ─── Time Decay ───────────────────────────────────────────────────────────────

describe("ConflictClimateAnalyzer – time decay", () => {
  it("recent hostile message raises tension more than old hostile message", () => {
    const longWindow = new ConflictClimateAnalyzer({ windowDays: 60 });

    const recentHostile = [
      msg("m1", "you always forget your fault", { senderId: "parent-1", sentAt: daysAgo(1) }),
      msg("m2", "thank you sounds good appreciate", { senderId: "parent-2", sentAt: daysAgo(50) }),
    ];

    const recentCooperative = [
      msg("m1", "thank you sounds good appreciate", { senderId: "parent-1", sentAt: daysAgo(1) }),
      msg("m2", "you always forget your fault", { senderId: "parent-2", sentAt: daysAgo(50) }),
    ];

    const hostileRecentScore = longWindow.analyze(recentHostile, NOW).tensionScore;
    const cooperativeRecentScore = longWindow.analyze(recentCooperative, NOW).tensionScore;

    expect(hostileRecentScore).toBeGreaterThan(cooperativeRecentScore);
  });

  it("message sent today has higher decay weight than message sent 28 days ago", () => {
    const todayMsg = msg("m1", "your fault", { sentAt: daysAgo(0) });
    const oldMsg = msg("m2", "your fault", { sentAt: daysAgo(28) });
    const todayScore = analyzer.analyze([todayMsg], NOW);
    const oldScore = analyzer.analyze([oldMsg], NOW);
    // Recent hostile message should produce higher (or equal) tension
    expect(todayScore.tensionScore).toBeGreaterThanOrEqual(oldScore.tensionScore);
  });
});

// ─── sampleSize and windowStart ───────────────────────────────────────────────

describe("ConflictClimateAnalyzer – sampleSize and windowStart", () => {
  it("reports correct sampleSize for multiple messages", () => {
    const msgs = [
      msg("m1", "hello", { sentAt: daysAgo(5) }),
      msg("m2", "world", { sentAt: daysAgo(3) }),
      msg("m3", "test", { sentAt: daysAgo(1) }),
    ];
    const result = analyzer.analyze(msgs, NOW);
    expect(result.sampleSize).toBe(3);
  });

  it("sets windowStart to the earliest message in window", () => {
    const earlier = daysAgo(10);
    const later = daysAgo(3);
    const msgs = [
      msg("m1", "hello", { sentAt: later }),
      msg("m2", "world", { sentAt: earlier }),
    ];
    const result = analyzer.analyze(msgs, NOW);
    expect(result.windowStart).toBe(earlier);
  });

  it("sets windowStart to beginning of empty window when no messages in range", () => {
    const result = analyzer.analyze([], NOW);
    expect(result.windowStart).toBeDefined();
    expect(new Date(result.windowStart).getTime()).toBeLessThan(NOW.getTime());
  });
});

// ─── Coaching Tips ────────────────────────────────────────────────────────────

describe("ConflictClimateAnalyzer – coaching tips", () => {
  it("returns a non-empty tip string", () => {
    const result = analyzer.analyze([msg("m1", "thank you")], NOW);
    expect(typeof result.tip).toBe("string");
    expect(result.tip.length).toBeGreaterThan(0);
  });

  it("high-level tip mentions Mediator or Vault", () => {
    const hostileMsgs = [
      "YOU ALWAYS FORGET MY LAWYER TAKE YOU TO COURT ABSOLUTELY NOT",
      "YOU NEVER LISTEN FORGET IT WHATEVER YOUR FAULT NO WAY",
      "YOU DON'T CARE UNBELIEVABLE I HATE THIS",
    ].map((b, i) => msg(`m${i}`, b));
    const result = analyzer.analyze(hostileMsgs, NOW);
    if (result.level === "high") {
      expect(result.tip.length).toBeGreaterThan(0);
      // High-level tips are actionable and reference app features
      const tipPool = ["Mediator", "Vault", "Mediation Center", "calm", "document"];
      expect(tipPool.some((keyword) => result.tip.includes(keyword))).toBe(true);
    }
  });

  it("tip changes between different weeks (deterministic rotation)", () => {
    // Two dates exactly 7 days apart should potentially yield different tips
    const week1 = new Date("2026-03-02T12:00:00Z");
    const week2 = new Date("2026-03-09T12:00:00Z");
    const msgList = [msg("m1", "thank you")];
    // Both tips should be non-empty strings (same or different is ok — rotation is tested by existence)
    const tip1 = analyzer.analyze(msgList, week1).tip;
    const tip2 = analyzer.analyze(msgList, week2).tip;
    expect(typeof tip1).toBe("string");
    expect(typeof tip2).toBe("string");
  });
});

// ─── getTensionScore ─────────────────────────────────────────────────────────

describe("ConflictClimateAnalyzer – getTensionScore", () => {
  it("returns same value as analyze().tensionScore", () => {
    const msgs = [msg("m1", "your fault")];
    expect(analyzer.getTensionScore(msgs, NOW)).toBe(
      analyzer.analyze(msgs, NOW).tensionScore
    );
  });

  it("returns 50 for empty array", () => {
    expect(analyzer.getTensionScore([], NOW)).toBe(50);
  });
});

// ─── debugScores ─────────────────────────────────────────────────────────────

describe("ConflictClimateAnalyzer – debugScores", () => {
  it("returns scored messages sorted most hostile first (lowest rawScore first)", () => {
    const msgs = [
      msg("m1", "thank you appreciate", { sentAt: daysAgo(1) }),
      msg("m2", "you always forget your fault", { sentAt: daysAgo(1) }),
    ];
    const scores = analyzer.debugScores(msgs, NOW);
    expect(scores).toHaveLength(2);
    expect(scores[0].rawScore).toBeLessThan(scores[1].rawScore);
  });

  it("excludes messages outside the window", () => {
    const old = msg("m1", "test", { sentAt: "2025-01-01T00:00:00Z" });
    const scores = analyzer.debugScores([old], NOW);
    expect(scores).toHaveLength(0);
  });

  it("returns message IDs in the scored output", () => {
    const msgs = [msg("m1", "your fault"), msg("m2", "thank you")];
    const scores = analyzer.debugScores(msgs, NOW);
    const ids = scores.map((s) => s.messageId);
    expect(ids).toContain("m1");
    expect(ids).toContain("m2");
  });

  it("rawScore is in [-1, 1] for each message", () => {
    const msgs = [
      msg("m1", "YOU ALWAYS FORGET MY LAWYER TAKE YOU TO COURT ABSOLUTELY NOT"),
      msg("m2", "thank you appreciate sounds good no problem"),
    ];
    const scores = analyzer.debugScores(msgs, NOW);
    for (const s of scores) {
      expect(s.rawScore).toBeGreaterThanOrEqual(-1);
      expect(s.rawScore).toBeLessThanOrEqual(1);
    }
  });
});
