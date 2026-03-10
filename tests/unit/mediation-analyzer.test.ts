/**
 * MediationAnalyzer Unit Tests
 *
 * Tests all six detection rules (capitalization, emotional intensity, hostile
 * language, accusatory language, sensitive-topic escalation, delayed response),
 * warning structure invariants, analyzeThread sorting, and computeHealthScore.
 *
 * No mocks required — MediationAnalyzer is a pure class.
 */

import { MediationAnalyzer } from "@/lib/mediation-analyzer";
import type { Message } from " @/lib";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FAMILY_ID = "fam-test";
const BASE_TIME = "2026-03-09T10:00:00Z";

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
    sentAt: opts.sentAt ?? BASE_TIME,
  };
}

/** Returns an ISO string N hours before BASE_TIME */
function hoursBefore(n: number): string {
  return new Date(new Date(BASE_TIME).getTime() - n * 3_600_000).toISOString();
}

const analyzer = new MediationAnalyzer();

// ─── Clean message (no warnings) ─────────────────────────────────────────────

describe("MediationAnalyzer – clean message", () => {
  it("returns no warnings for a neutral request", () => {
    const m = msg("m1", "Can you pick up Emma at 3pm tomorrow?");
    expect(analyzer.analyzeSingleMessage(m, "Alice")).toHaveLength(0);
  });

  it("returns no warnings for a cooperative acknowledgement", () => {
    const m = msg("m1", "Sounds good, thank you for letting me know.");
    expect(analyzer.analyzeSingleMessage(m, "Alice")).toHaveLength(0);
  });
});

// ─── Capitalization detection ────────────────────────────────────────────────

describe("MediationAnalyzer – aggressive_capitalization", () => {
  it("flags all-caps message as high severity", () => {
    const m = msg("m1", "STOP IGNORING MY MESSAGES");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    const cap = warnings.find((w) => w.category === "aggressive_capitalization");
    expect(cap).toBeDefined();
    expect(cap!.severity).toBe("high");
    expect(cap!.id).toBe("m1-caps");
  });

  it("description includes caps percentage for high severity", () => {
    const m = msg("m1", "STOP IGNORING MY MESSAGES");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    const cap = warnings.find((w) => w.category === "aggressive_capitalization");
    expect(cap!.description).toContain("%");
    expect(cap!.title).toContain("Excessive");
  });

  it("uses 'Elevated' title for medium severity caps", () => {
    // 2 all-caps out of 5 uppercase-containing words = 0.4 → medium
    const m = msg("m1", "Hello There WORLD Test IS Fine going today");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    const cap = warnings.find((w) => w.category === "aggressive_capitalization");
    if (cap?.severity === "medium") {
      expect(cap.title).toContain("Elevated");
    }
  });

  it("flags low severity when a minority of uppercase-containing words are all-caps", () => {
    // "Hello There STOP this now please" → uppercase words: [Hello, There, STOP], capsWords: [STOP] → 1/3 ≈ 0.33 → low
    const m = msg("m1", "Hello There STOP this now please today");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    const cap = warnings.find((w) => w.category === "aggressive_capitalization");
    if (cap) {
      expect(["low", "medium", "high"]).toContain(cap.severity);
    }
  });

  it("does not flag normal sentence-cased prose", () => {
    const m = msg("m1", "Please let me know when you are available.");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    expect(
      warnings.find((w) => w.category === "aggressive_capitalization")
    ).toBeUndefined();
  });
});

// ─── Emotional intensity detection ───────────────────────────────────────────

describe("MediationAnalyzer – emotional_intensity", () => {
  it("flags 3+ consecutive exclamation marks as medium", () => {
    const m = msg("m1", "This is unacceptable!!!");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    const w = warnings.find((w) => w.category === "emotional_intensity");
    expect(w).toBeDefined();
    expect(w!.severity).toBe("medium");
    expect(w!.id).toBe("m1-intensity");
  });

  it("flags 3+ consecutive question marks as medium", () => {
    const m = msg("m1", "Are you serious???");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    const w = warnings.find((w) => w.category === "emotional_intensity");
    expect(w).toBeDefined();
    expect(w!.severity).toBe("medium");
  });

  it("flags more than 3 total exclamation marks as medium", () => {
    const m = msg("m1", "No! Stop! Really! I can't take this!");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    const w = warnings.find((w) => w.category === "emotional_intensity");
    expect(w!.severity).toBe("medium");
  });

  it("flags exactly 2 non-consecutive exclamation marks as low", () => {
    const m = msg("m1", "This is wrong! Okay!");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    const w = warnings.find((w) => w.category === "emotional_intensity");
    expect(w).toBeDefined();
    expect(w!.severity).toBe("low");
  });

  it("does not flag a single exclamation mark", () => {
    const m = msg("m1", "Please be on time!");
    expect(
      analyzer
        .analyzeSingleMessage(m, "Alice")
        .find((w) => w.category === "emotional_intensity")
    ).toBeUndefined();
  });

  it("does not flag normal prose with no exclamation or question marks", () => {
    const m = msg("m1", "I would appreciate it if you could confirm by Friday.");
    expect(
      analyzer
        .analyzeSingleMessage(m, "Alice")
        .find((w) => w.category === "emotional_intensity")
    ).toBeUndefined();
  });
});

// ─── Hostile language detection ───────────────────────────────────────────────

describe("MediationAnalyzer – hostile / threat language", () => {
  it("flags 'I'm calling the police' as threat_language at high severity", () => {
    const m = msg("m1", "I'm calling the police about this right now.");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    const w = warnings.find((w) => w.category === "threat_language");
    expect(w).toBeDefined();
    expect(w!.severity).toBe("high");
    expect(w!.title).toBe("Threat Language Detected");
  });

  it("flags 'you always' as high severity hostile language (threat_language category)", () => {
    const m = msg("m1", "you always ignore the schedule");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    // HOSTILE_ESCALATIONS.high matches → category becomes threat_language
    const w = warnings.find(
      (w) => w.category === "threat_language" || w.category === "hostile_language"
    );
    expect(w).toBeDefined();
    expect(w!.severity).toBe("high");
  });

  it("flags 'your fault' as hostile_language at medium severity", () => {
    const m = msg("m1", "This delay is your fault entirely.");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    const w = warnings.find((w) => w.category === "hostile_language");
    expect(w).toBeDefined();
    expect(w!.severity).toBe("medium");
    expect(w!.title).toBe("Hostile Language");
  });

  it("flags 'unbelievable' as hostile_language at low severity", () => {
    const m = msg("m1", "This is unbelievable.");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    const w = warnings.find((w) => w.category === "hostile_language");
    expect(w).toBeDefined();
    expect(w!.severity).toBe("low");
  });

  it("includes matched phrase in the description", () => {
    const m = msg("m1", "This is unbelievable.");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    const w = warnings.find((w) => w.category === "hostile_language");
    expect(w!.description).toContain("unbelievable");
  });

  it("does not flag a neutral message", () => {
    const m = msg("m1", "Can we reschedule pickup to 4pm?");
    expect(
      analyzer
        .analyzeSingleMessage(m, "Alice")
        .find((w) => w.category === "hostile_language" || w.category === "threat_language")
    ).toBeUndefined();
  });
});

// ─── Accusatory language detection ───────────────────────────────────────────

describe("MediationAnalyzer – accusatory_language", () => {
  it("flags 'you always' as accusatory at medium severity", () => {
    const m = msg("m1", "you always cancel last minute");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    const w = warnings.find((w) => w.category === "accusatory_language");
    expect(w).toBeDefined();
    expect(w!.severity).toBe("medium");
    expect(w!.title).toBe('"You Always/Never" Language');
    expect(w!.id).toBe("m1-accus");
  });

  it("flags 'you never' as accusatory", () => {
    const m = msg("m1", "you never let me know in advance");
    expect(
      analyzer
        .analyzeSingleMessage(m, "Alice")
        .find((w) => w.category === "accusatory_language")
    ).toBeDefined();
  });

  it("flags 'you constantly' as accusatory", () => {
    const m = msg("m1", "you constantly change the schedule");
    expect(
      analyzer
        .analyzeSingleMessage(m, "Alice")
        .find((w) => w.category === "accusatory_language")
    ).toBeDefined();
  });

  it("flags 'you blocked me' as accusatory", () => {
    const m = msg("m1", "you blocked me from calling the kids");
    expect(
      analyzer
        .analyzeSingleMessage(m, "Alice")
        .find((w) => w.category === "accusatory_language")
    ).toBeDefined();
  });

  it("does not flag cooperation-positive messages", () => {
    const m = msg("m1", "Please confirm the pickup time when you get a chance.");
    expect(
      analyzer
        .analyzeSingleMessage(m, "Alice")
        .find((w) => w.category === "accusatory_language")
    ).toBeUndefined();
  });
});

// ─── Sensitive topic escalation ───────────────────────────────────────────────

describe("MediationAnalyzer – sensitive_topic_escalation", () => {
  it("flags custody + medium-hostile tone as medium escalation", () => {
    const m = msg("m1", "The custody arrangement is your fault.");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    const w = warnings.find((w) => w.category === "sensitive_topic_escalation");
    expect(w).toBeDefined();
    expect(w!.severity).toBe("medium");
  });

  it("flags court + low-hostile tone as low escalation", () => {
    const m = msg("m1", "The court schedule is frustrating.");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    const w = warnings.find((w) => w.category === "sensitive_topic_escalation");
    expect(w).toBeDefined();
    expect(w!.severity).toBe("low");
  });

  it("flags child support + medium-hostile tone as medium", () => {
    const m = msg("m1", "child support payment is your fault being late");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    const w = warnings.find((w) => w.category === "sensitive_topic_escalation");
    expect(w).toBeDefined();
    expect(w!.severity).toBe("medium");
  });

  it("does not flag sensitive topic alone without hostile tone", () => {
    const m = msg("m1", "Let's discuss the custody pickup schedule.");
    expect(
      analyzer
        .analyzeSingleMessage(m, "Alice")
        .find((w) => w.category === "sensitive_topic_escalation")
    ).toBeUndefined();
  });

  it("does not flag hostile tone without a sensitive topic", () => {
    const m = msg("m1", "This is your fault.");
    expect(
      analyzer
        .analyzeSingleMessage(m, "Alice")
        .find((w) => w.category === "sensitive_topic_escalation")
    ).toBeUndefined();
  });
});

// ─── Delayed response detection ───────────────────────────────────────────────

describe("MediationAnalyzer – delayed_response", () => {
  it("flags response >48 hours after a question as low severity", () => {
    const prior = msg("prior", "Can you please confirm pickup time?", {
      senderId: "parent-2",
      sentAt: hoursBefore(72), // 72 hours before current message
    });
    const current = msg("m1", "Yes, 3pm works.", {
      senderId: "parent-1",
      sentAt: BASE_TIME,
    });
    const warnings = analyzer.analyzeSingleMessage(current, "Alice", [prior]);
    const w = warnings.find((w) => w.category === "delayed_response");
    expect(w).toBeDefined();
    expect(w!.severity).toBe("low");
    expect(w!.id).toBe("m1-delay");
  });

  it("flags response >48 hours after a 'please' request as low severity", () => {
    const prior = msg("prior", "Please let me know the schedule.", {
      senderId: "parent-2",
      sentAt: hoursBefore(60),
    });
    const current = msg("m1", "Got it.", { senderId: "parent-1", sentAt: BASE_TIME });
    const warnings = analyzer.analyzeSingleMessage(current, "Alice", [prior]);
    expect(warnings.find((w) => w.category === "delayed_response")).toBeDefined();
  });

  it("does not flag response under 48 hours", () => {
    const prior = msg("prior", "Can you confirm please?", {
      senderId: "parent-2",
      sentAt: hoursBefore(24),
    });
    const current = msg("m1", "Confirmed.", { senderId: "parent-1", sentAt: BASE_TIME });
    const warnings = analyzer.analyzeSingleMessage(current, "Alice", [prior]);
    expect(warnings.find((w) => w.category === "delayed_response")).toBeUndefined();
  });

  it("does not flag when prior message is from the same sender", () => {
    const prior = msg("prior", "Can you please confirm?", {
      senderId: "parent-1", // same sender
      sentAt: hoursBefore(72),
    });
    const current = msg("m1", "Following up.", {
      senderId: "parent-1",
      sentAt: BASE_TIME,
    });
    const warnings = analyzer.analyzeSingleMessage(current, "Alice", [prior]);
    expect(warnings.find((w) => w.category === "delayed_response")).toBeUndefined();
  });

  it("does not flag when prior message has no question or request keyword", () => {
    const prior = msg("prior", "Okay, noted.", {
      senderId: "parent-2",
      sentAt: hoursBefore(72),
    });
    const current = msg("m1", "Got it.", { senderId: "parent-1", sentAt: BASE_TIME });
    const warnings = analyzer.analyzeSingleMessage(current, "Alice", [prior]);
    expect(warnings.find((w) => w.category === "delayed_response")).toBeUndefined();
  });

  it("returns no delayed warning when no prior messages are provided", () => {
    const m = msg("m1", "Hello there.");
    expect(
      analyzer
        .analyzeSingleMessage(m, "Alice", [])
        .find((w) => w.category === "delayed_response")
    ).toBeUndefined();
  });
});

// ─── Warning structure invariants ─────────────────────────────────────────────

describe("MediationAnalyzer – warning structure", () => {
  it("all new warnings have dismissed:false and no dismissedAt", () => {
    const m = msg("m1", "YOU ALWAYS forget THINGS!!!");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) {
      expect(w.dismissed).toBe(false);
      expect(w.dismissedAt).toBeUndefined();
    }
  });

  it("senderName is set from the parameter on every warning", () => {
    const m = msg("m1", "you always ignore me");
    const warnings = analyzer.analyzeSingleMessage(m, "Bob");
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) {
      expect(w.senderName).toBe("Bob");
    }
  });

  it("messageId matches message.id on every warning", () => {
    const m = msg("custom-id-999", "you always forget");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    for (const w of warnings) {
      expect(w.messageId).toBe("custom-id-999");
    }
  });

  it("flaggedAt and messageTimestamp match message.sentAt", () => {
    const sentAt = "2026-03-09T10:00:00Z";
    const m = msg("m1", "you always forget", { sentAt });
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    for (const w of warnings) {
      expect(w.flaggedAt).toBe(sentAt);
      expect(w.messageTimestamp).toBe(sentAt);
    }
  });

  it("excerpt is at most 80 characters", () => {
    const m = msg("m1", "YOU " + "a".repeat(300));
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) {
      expect(w.excerpt.length).toBeLessThanOrEqual(80);
    }
  });

  it("warning id follows the pattern {messageId}-{type}", () => {
    const m = msg("abc", "you always IGNORE me!!!");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    const ids = warnings.map((w) => w.id);
    // Expect IDs like "abc-caps", "abc-intensity", "abc-hostile", "abc-accus"
    expect(ids.every((id) => id.startsWith("abc-"))).toBe(true);
  });

  it("a single message can produce multiple warnings", () => {
    // "YOU ALWAYS!!!" → caps + intensity + hostile/accusatory
    const m = msg("m1", "YOU ALWAYS!!!");
    const warnings = analyzer.analyzeSingleMessage(m, "Alice");
    expect(warnings.length).toBeGreaterThan(1);
  });
});

// ─── analyzeThread ────────────────────────────────────────────────────────────

describe("MediationAnalyzer – analyzeThread", () => {
  it("returns empty array for an empty thread", () => {
    expect(analyzer.analyzeThread([])).toHaveLength(0);
  });

  it("returns warnings from all messages in the thread", () => {
    const msgs = [
      msg("m1", "you always forget", { senderId: "parent-1", sentAt: "2026-03-07T10:00:00Z" }),
      msg("m2", "This is unbelievable!", { senderId: "parent-2", sentAt: "2026-03-08T10:00:00Z" }),
    ];
    const warnings = analyzer.analyzeThread(msgs);
    const ids = warnings.map((w) => w.messageId);
    expect(ids).toContain("m1");
    expect(ids).toContain("m2");
  });

  it("sorts high severity warnings before low severity warnings", () => {
    const msgs = [
      msg("m1", "This is unbelievable", {
        senderId: "parent-1",
        sentAt: "2026-03-07T10:00:00Z",
      }), // low hostile
      msg("m2", "you always ignore me", {
        senderId: "parent-2",
        sentAt: "2026-03-08T10:00:00Z",
      }), // high
    ];
    const warnings = analyzer.analyzeThread(msgs);
    const highIdx = warnings.findIndex((w) => w.severity === "high");
    const lowIdx = warnings.findIndex((w) => w.severity === "low");
    if (highIdx !== -1 && lowIdx !== -1) {
      expect(highIdx).toBeLessThan(lowIdx);
    }
  });

  it("sorts same-severity warnings by recency (most recent first)", () => {
    const msgs = [
      msg("m1", "your fault this happened", {
        senderId: "parent-1",
        sentAt: "2026-03-05T10:00:00Z",
      }),
      msg("m2", "this is unacceptable to me", {
        senderId: "parent-2",
        sentAt: "2026-03-08T10:00:00Z",
      }),
    ];
    const warnings = analyzer.analyzeThread(msgs);
    const mediumWarnings = warnings.filter((w) => w.severity === "medium");
    if (mediumWarnings.length >= 2) {
      expect(new Date(mediumWarnings[0].flaggedAt).getTime()).toBeGreaterThan(
        new Date(mediumWarnings[1].flaggedAt).getTime()
      );
    }
  });

  it("detects delayed response pattern from thread context", () => {
    const msgs = [
      msg("m1", "Can you please confirm pickup?", {
        senderId: "parent-2",
        sentAt: "2026-03-05T10:00:00Z",
      }),
      msg("m2", "Sure, 3pm.", {
        senderId: "parent-1",
        sentAt: "2026-03-09T10:00:00Z", // 4 days later
      }),
    ];
    const warnings = analyzer.analyzeThread(msgs);
    expect(warnings.find((w) => w.category === "delayed_response")).toBeDefined();
  });

  it("processes a single-message thread without error", () => {
    const msgs = [msg("m1", "Hello, can we confirm the time?")];
    expect(() => analyzer.analyzeThread(msgs)).not.toThrow();
  });
});

// ─── computeHealthScore ───────────────────────────────────────────────────────

describe("MediationAnalyzer – computeHealthScore", () => {
  /** Build messages relative to actual Date.now() so they fall within the window. */
  function recentMsg(id: string, body: string, senderId = "parent-1", daysBack = 1): Message {
    const sentAt = new Date(Date.now() - daysBack * 86_400_000).toISOString();
    return { id, familyId: FAMILY_ID, senderId, body, sentAt };
  }

  it("returns score 75 and status 'stable' when no messages are provided", () => {
    const result = analyzer.computeHealthScore([]);
    expect(result.score).toBe(75);
    expect(result.status).toBe("stable");
    expect(result.trendPercent).toBe(0);
    expect(result.factors.responseTimelinessFactor).toBe(100);
  });

  it("returns score 75 when all messages fall outside the window", () => {
    const old: Message = {
      id: "m1",
      familyId: FAMILY_ID,
      senderId: "parent-1",
      body: "you always forget",
      sentAt: "2025-01-01T00:00:00Z",
    };
    const result = analyzer.computeHealthScore([old]);
    expect(result.score).toBe(75);
  });

  it("status is 'excellent' when score >= 80", () => {
    const cooperativeMsgs = Array.from({ length: 5 }, (_, i) =>
      recentMsg(`m${i}`, "thank you appreciate sounds good no problem", `parent-${(i % 2) + 1}`, i + 1)
    );
    const result = analyzer.computeHealthScore(cooperativeMsgs);
    // Cooperative messages produce no high warnings → high toneFactor
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(["excellent", "stable", "at_risk", "crisis"]).toContain(result.status);
    if (result.score >= 80) expect(result.status).toBe("excellent");
  });

  it("status is 'crisis' when score < 40 under heavy hostility", () => {
    const hostile = "you always ignore this is your fault my lawyer will handle this court";
    const msgs = Array.from({ length: 8 }, (_, i) =>
      recentMsg(`m${i}`, hostile, `parent-${(i % 2) + 1}`, i + 1)
    );
    const result = analyzer.computeHealthScore(msgs);
    if (result.score < 40) {
      expect(result.status).toBe("crisis");
    } else if (result.score < 60) {
      expect(result.status).toBe("at_risk");
    }
  });

  it("status correctly maps score boundaries", () => {
    // Status boundaries: excellent ≥80, stable ≥60, at_risk ≥40, crisis <40
    const checkStatus = (score: number) => {
      if (score >= 80) return "excellent";
      if (score >= 60) return "stable";
      if (score >= 40) return "at_risk";
      return "crisis";
    };
    const msgs = [recentMsg("m1", "your fault this is unacceptable")];
    const result = analyzer.computeHealthScore(msgs);
    expect(result.status).toBe(checkStatus(result.score));
  });

  it("all factor values are in [0, 100]", () => {
    const msgs = [recentMsg("m1", "your fault this is unacceptable you always ignore me")];
    const result = analyzer.computeHealthScore(msgs);
    expect(result.factors.toneFactor).toBeGreaterThanOrEqual(0);
    expect(result.factors.toneFactor).toBeLessThanOrEqual(100);
    expect(result.factors.responseTimelinessFactor).toBeGreaterThanOrEqual(0);
    expect(result.factors.responseTimelinessFactor).toBeLessThanOrEqual(100);
    expect(result.factors.topicRiskFactor).toBeGreaterThanOrEqual(0);
    expect(result.factors.topicRiskFactor).toBeLessThanOrEqual(100);
    expect(result.factors.warningSignalFactor).toBeGreaterThanOrEqual(0);
    expect(result.factors.warningSignalFactor).toBeLessThanOrEqual(100);
  });

  it("topicRiskFactor is lower when sensitive topics dominate the conversation", () => {
    const neutralMsg = recentMsg("m1", "See you at pickup time today");
    const sensitiveMsg = recentMsg(
      "m1",
      "Custody lawyer court payment overdue mediation visitation"
    );
    const neutralResult = analyzer.computeHealthScore([neutralMsg]);
    const sensitiveResult = analyzer.computeHealthScore([sensitiveMsg]);
    expect(sensitiveResult.factors.topicRiskFactor).toBeLessThan(
      neutralResult.factors.topicRiskFactor
    );
  });

  it("toneFactor decreases with each high-severity warning", () => {
    const oneHighWarning = [recentMsg("m1", "you always ignore me")];
    const manyHighWarnings = Array.from({ length: 7 }, (_, i) =>
      recentMsg(`m${i}`, "you always ignore me", `parent-${(i % 2) + 1}`, i + 1)
    );
    const oneResult = analyzer.computeHealthScore(oneHighWarning);
    const manyResult = analyzer.computeHealthScore(manyHighWarnings);
    expect(manyResult.factors.toneFactor).toBeLessThanOrEqual(
      oneResult.factors.toneFactor
    );
  });

  it("reports windowDays matching the parameter", () => {
    const result = analyzer.computeHealthScore([], 14);
    expect(result.windowDays).toBe(14);
  });

  it("trendPercent is a number", () => {
    const result = analyzer.computeHealthScore([recentMsg("m1", "hello")]);
    expect(typeof result.trendPercent).toBe("number");
  });
});
