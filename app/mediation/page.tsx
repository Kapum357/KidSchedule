/**
 * KidSchedule – Mediation & AI Assistant Center
 *
 * A Next.js Server Component for co-parent dispute management and communication health
 * monitoring. Features conflict tracking, AI-assisted mediation, warning signals, and
 * neutral response drafting using template-based and LLM-powered assistance.
 *
 */

import { db } from "@/lib/persistence";
import { requireAuth } from "@/lib";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ConflictClimateAnalyzer } from "@/lib/conflict-analyzer";
import { MediationAnalyzer, type WarningSignal } from "@/lib/mediation-analyzer";
import type { Message, Parent } from "@/types";
import type { DbParent } from "@/lib/persistence/types";
import { loadMediationData } from "./page-actions";
import { WarningsPanel } from "@/components/warnings-panel";
import { HealthOverviewTips } from "@/components/health-overview-tips";
import { MediationInterface } from "@/components/mediation-interface";

// ─── Types ────────────────────────────────────────────────────────────────────

type MediationSearchParams = {
  topicId?: string;
};

interface ConflictFrequencyDataPoint {
  day: string; // "Mon", "Tue", etc.
  count: number; // 0-7 conflicts detected
  isAlertDay: boolean; // red background if true
}

interface MediationTopic {
  id: string;
  title: string;
  description?: string;
  status: "draft" | "in_progress" | "resolved";
  createdAt: string;
  lastEditedAt: string;
  draftSuggestion?: string;
  isNew: boolean; // for UI indicator (pulse)
}

interface HealthOverviewData {
  score: number; // 0-100
  status: "excellent" | "stable" | "at_risk" | "crisis";
  tensionLevel: "low" | "medium" | "high";
  warningCount: number;
  conflictTrendPercent: number; // positive = trending up (worse)
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function mapParent(row: DbParent): Parent {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl ?? undefined,
    phone: row.phone ?? undefined,
  };
}

/**
 * Calculate background color for health status gauge
 */
function getHealthStatusColor(status: HealthOverviewData["status"]): string {
  switch (status) {
    case "excellent":
      return "text-emerald-600 dark:text-emerald-400";
    case "stable":
      return "text-primary dark:text-primary";
    case "at_risk":
      return "text-amber-600 dark:text-amber-400";
    case "crisis":
      return "text-red-600 dark:text-red-400";
  }
}

function getHealthStatusLabel(status: HealthOverviewData["status"]): string {
  const labels: Record<HealthOverviewData["status"], string> = {
    excellent: "Excellent",
    stable: "Stable",
    at_risk: "At Risk",
    crisis: "Crisis",
  };
  return labels[status];
}

/**
 * Get badge color for warning signal severity
 */
function getWarningSeverityColor(signal: WarningSignal): string {
  switch (signal.severity) {
    case "high":
      return "bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500";
    case "medium":
      return "bg-amber-50 dark:bg-amber-900/10 border-l-4 border-amber-500";
    case "low":
      return "bg-slate-50 dark:bg-slate-800 border-l-4 border-slate-400";
  }
}

function getWarningLabel(category: WarningSignal["category"]): string {
  const labels: Record<WarningSignal["category"], string> = {
    aggressive_capitalization: "Aggressive Capitalization",
    emotional_intensity: "Emotional Intensity",
    hostile_language: "Hostile Language",
    sensitive_topic_escalation: "Topic Escalation",
    delayed_response: "Late Night Comms",
    accusatory_language: "Accusatory Language",
    threat_language: "Threat Language",
    personal_attack: "Personal Attack",
  };
  return labels[category];
}

/**
 * Format relative time for warning display
 */
function formatWarningTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 2) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(isoString).toLocaleDateString();
}

/**
 * Accessor for warning creation timestamp. Some WarningSignal shapes from
 * the analyzer may use different field names (createdAt, sentAt, timestamp).
 * Normalize access here so TypeScript only needs a single, narrow cast.
 */
function getWarningCreatedAt(warning: WarningSignal): string {
  // Prefer createdAt, fallback to common alternatives; default to now ISO
  // Use an any-cast only inside this function to avoid spreading `any`.
  const w = warning as unknown as { createdAt?: string; sentAt?: string; timestamp?: string };
  return w.createdAt ?? w.sentAt ?? w.timestamp ?? new Date().toISOString();
}

/**
 * Generate conflict frequency data for last 7 days
 * Algorithm: Count warning signals per day, flag days with >2 signals as alert days
 */
function getConflictFrequencyData(warnings: WarningSignal[]): ConflictFrequencyDataPoint[] {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const now = new Date();
  const counts = new Map<string, number>();

  // Initialize counts for last 7 days
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayKey = date.toISOString().split("T")[0];
    counts.set(dayKey, 0);
  }

  // Count warnings per day
  for (const warning of warnings) {
    const warningDate = getWarningCreatedAt(warning).split("T")[0];
    if (counts.has(warningDate)) {
      counts.set(warningDate, (counts.get(warningDate) ?? 0) + 1);
    }
  }

  // Map to display format
  const result: ConflictFrequencyDataPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayKey = date.toISOString().split("T")[0];
    const count = counts.get(dayKey) ?? 0;
    result.push({
      day: days[date.getDay()],
      count,
      isAlertDay: count > 2, // Alert if >2 warnings in a day
    });
  }

  return result;
}

/**
 * Get height percentage for conflict frequency bar
 * Max realistic height: 7 warnings (scales to 100%)
 */
function getBarHeightPercent(count: number): number {
  return Math.min((count / 7) * 100, 100);
}


// ─── Component: Sidebar ────────────────────────────────────────────────────────

function MediationSidebar({
  currentParent,
}: Readonly<{
  currentParent: Parent;
}>) {
  return (
    <aside className="w-64 bg-surface-light dark:bg-surface-dark border-r border-slate-200 dark:border-slate-800 flex-shrink-0 flex flex-col z-20 hidden lg:flex">
      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <div className="bg-primary/20 p-2 rounded-lg text-primary">
          <span className="material-symbols-outlined text-2xl">family_restroom</span>
        </div>
        <span className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">
          KidSchedule
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1 mt-4">
        <a
          href="/dashboard"
          className="flex items-center gap-3 px-4 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <span className="material-symbols-outlined">dashboard</span>
          <span className="font-medium">Dashboard</span>
        </a>
        <a
          href="/mediation"
          className="flex items-center gap-3 px-4 py-3 bg-primary/10 text-primary dark:text-primary rounded-lg font-semibold"
        >
          <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
            handshake
          </span>
          <span>Mediation Center</span>
        </a>
        <a
          href="/messages"
          className="flex items-center gap-3 px-4 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <span className="material-symbols-outlined">forum</span>
          <span className="font-medium">Active Sessions</span>
        </a>
        <a
          href="/mediation/warnings"
          className="flex items-center gap-3 px-4 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <span className="material-symbols-outlined">warning</span>
          <span className="font-medium">Warning Log</span>
        </a>
        <a
          href="/mediation/reports"
          className="flex items-center gap-3 px-4 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <span className="material-symbols-outlined">bar_chart</span>
          <span className="font-medium">Reports</span>
        </a>
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-bold text-sm">
            {currentParent.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-800 dark:text-white">
              {currentParent.name}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Co-Parent</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Component: Communication Health Overview ──────────────────────────────────

function HealthOverviewCard({
  data,
  conflictFrequency,
}: Readonly<{
  data: HealthOverviewData;
  conflictFrequency: ConflictFrequencyDataPoint[];
}>) {
  const statusColor = getHealthStatusColor(data.status);
  const statusLabel = getHealthStatusLabel(data.status);

  // Gauge needle rotation: low → 0°, medium → -45°, high → -90°
  const gaugeRotation =
    data.tensionLevel === "low" ? "0deg" : data.tensionLevel === "medium" ? "-45deg" : "-90deg";

  return (
    <div className="lg:col-span-8 bg-surface-light dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">monitor_heart</span>
          Communication Health Overview
        </h2>
        <span className={`text-xs font-semibold ${statusColor} px-2 py-1 rounded-full`}>
          Status: {statusLabel}
        </span>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Gauge */}
          <div className="w-full md:w-1/3 flex flex-col items-center justify-center p-4 bg-background-light dark:bg-background-dark rounded-lg">
            <div className="relative w-40 h-24 overflow-hidden mb-2">
              {/* Semi-circle track (gray) */}
              <div className="absolute top-0 left-0 w-40 h-40 rounded-full border-[12px] border-slate-200 dark:border-slate-700 border-b-transparent border-l-transparent transform -rotate-45" />
              {/* Colored arc (filled portion) */}
              <div
                className={`absolute top-0 left-0 w-40 h-40 rounded-full border-[12px] ${statusColor.split(" ")[0]} border-t-transparent border-r-transparent border-b-transparent transform rotate-[45deg]`}
                style={{
                  clipPath: `polygon(0 0, 100% 0, 100% ${(data.score / 100) * 50 + 50}%, 0 ${(data.score / 100) * 50 + 50}%)`,
                }}
              />
              {/* Needle */}
              <div
                className="absolute bottom-0 left-1/2 w-1 h-20 bg-slate-800 dark:bg-white origin-bottom rounded-full"
                style={{ transform: `translateX(-50%) rotate(${gaugeRotation})` }}
              />
            </div>
            <h3 className="font-semibold text-slate-700 dark:text-slate-200 mt-2">Climate Gauge</h3>
            <p className="text-sm text-slate-500">
              {data.tensionLevel === "low"
                ? "Neutral / Cooperative"
                : data.tensionLevel === "medium"
                  ? "Moderate / Caution"
                  : "High / Escalating"}
            </p>
          </div>

          {/* Conflict Frequency Chart */}
          <div className="w-full md:w-2/3 flex flex-col justify-end">
            <h3 className="text-sm font-semibold text-slate-500 mb-4">Conflict Frequency (Last 7 Days)</h3>
            <div className="flex items-end justify-between h-32 gap-2">
              {conflictFrequency.map((point, idx) => (
                <div
                  key={idx}
                  className={`w-full rounded-t-sm relative group`}
                  style={{
                    height: `${Math.max(8, getBarHeightPercent(point.count))}px`,
                    backgroundColor: point.isAlertDay
                      ? "rgb(239, 68, 68)"
                      : "rgba(107, 202, 189, 0.3)",
                  }}
                >
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-medium opacity-0 group-hover:opacity-100 whitespace-nowrap">
                    {point.day}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* De-escalation Tips */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-emerald-500">tips_and_updates</span>
            Suggested Actions
          </h3>
          <HealthOverviewTips />
        </div>
      </div>
    </div>
  );
}

// ─── Component: Warning Signals Panel is now a client component imported from @/components/warnings-panel

// ─── Component: AI Mediator Interface ──────────────────────────────────────────

function AIMediatorInterface({
  topics,
  selectedTopic,
}: Readonly<{
  topics: MediationTopic[];
  selectedTopic?: MediationTopic;
}>) {
  const activeTopic = selectedTopic || topics[0];

  return (
    <div className="lg:col-span-12 bg-white dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col lg:flex-row h-[500px]">
      {/* Topic Sidebar */}
      <div className="w-full lg:w-1/3 bg-slate-50 dark:bg-slate-800/50 border-r border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="bg-primary text-white p-1.5 rounded-lg shadow-sm">
            <span className="material-symbols-outlined text-xl">psychology</span>
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">AI Mediator</h2>
        </div>

        <p className="text-sm text-slate-500 mb-6">
          Select a topic to start a guided session or draft a neutral response.
        </p>

        <div className="space-y-3">
          {topics.map((topic) => (
            <button
              key={topic.id}
              className={`w-full text-left p-3 rounded-lg transition-colors relative ${
                topic.id === activeTopic.id
                  ? "bg-white dark:bg-surface-dark border border-primary ring-1 ring-primary shadow-sm"
                  : "bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 hover:border-primary/50"
              }`}
            >
              {topic.isNew && (
                <span className="absolute right-3 top-3 h-2 w-2 bg-primary rounded-full animate-pulse" />
              )}
              <h4 className="font-semibold text-slate-800 dark:text-white text-sm">
                {topic.title}
              </h4>
              <p className="text-xs text-slate-500 mt-1 truncate">
                {topic.status === "draft"
                  ? `Draft in progress • Last edit ${formatWarningTime(topic.lastEditedAt)}`
                  : `Pending response • ${formatWarningTime(topic.createdAt)}`}
              </p>
            </button>
          ))}

          <button className="w-full flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:text-primary hover:border-primary hover:bg-primary/5 transition-all text-sm font-medium">
            <span className="material-symbols-outlined text-lg">add</span>
            Start New Topic
          </button>
        </div>
      </div>

      {/* Chat Interface */}
      <div className="flex-1 flex flex-col bg-surface-light dark:bg-surface-dark">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-white">{activeTopic.title}</h3>
            <p className="text-xs text-slate-500">Guided Mediation Mode</p>
          </div>
          <button className="text-xs font-medium text-slate-500 hover:text-primary flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">history</span>
            History
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {/* AI Message */}
          <div className="flex gap-4 max-w-2xl">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex-shrink-0 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-sm">smart_toy</span>
            </div>
            <div className="space-y-2">
              <div className="bg-primary/10 dark:bg-primary/5 p-4 rounded-2xl rounded-tl-none text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                <p>
                  I&apos;ve noticed some tension regarding the pickup times for December 24th. Based
                  on your parenting plan, here is a neutral draft proposal you might consider
                  sending:
                </p>
              </div>

              {/* Draft Suggestion */}
              {activeTopic.draftSuggestion && (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl shadow-sm relative group">
                  <p className="text-slate-600 dark:text-slate-300 italic text-sm">
                    &quot;{activeTopic.draftSuggestion}&quot;
                  </p>
                  <button
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-primary"
                    title="Copy"
                    aria-label="Copy suggestion to clipboard"
                  >
                    <span className="material-symbols-outlined text-sm">content_copy</span>
                  </button>
                </div>
              )}

              {/* Adjustment Buttons */}
              <div className="flex gap-2">
                <button className="text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-3 py-1.5 rounded-full text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary transition-colors">
                  Adjust tone to be firmer
                </button>
                <button className="text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 px-3 py-1.5 rounded-full text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary transition-colors">
                  Make it shorter
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mediation Interface */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-dark">
          <MediationInterface
            topicId={activeTopic.id}
            topicTitle={activeTopic.title}
            draftSuggestion={activeTopic.draftSuggestion}
            recipientParentId="recipient_parent_id_here"
          />
          <div className="flex justify-between items-center mt-4 px-1">
            <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">
              AI De-escalation Active
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page Entry Point ──────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export default async function MediationPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<MediationSearchParams> }>) {
  // ── Auth & DB ──────────────────────────────────────────────────────────────
  const user = await requireAuth();
  const parent = await db.parents.findByUserId(user.userId);
  if (!parent) console.error(`No parent record found for userId ${user.userId}`);

  const activeParent = parent as NonNullable<typeof parent>;

  const [dbParents, dbMessages] = await Promise.all([
    db.parents.findByFamilyId(activeParent.familyId),
    db.messages.findByFamilyId(activeParent.familyId),
  ]);

  if (dbParents.length < 2) {
    console.error(`Not enough parents found for familyId ${activeParent.familyId}`);
  }

  const mappedParent = mapParent(
    dbParents.find((p) => p.id === activeParent.id) || dbParents[0]
  );

  // ── Analyze Communication Health ────────────────────────────────────────────
  // Get messages from last 30 days for conflict analysis
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentMessages = dbMessages.filter((msg) => {
    const msgDate = new Date(msg.sentAt);
    return msgDate >= thirtyDaysAgo;
  });

  // Calculate conflict climate (tension score)
  const climateAnalyzer = new ConflictClimateAnalyzer({ windowDays: 30 });
  const climate = climateAnalyzer.analyze(recentMessages as Message[], new Date());

  // ── Load Mediation Data (Topics & Warnings) ────────────────────────────────
  const mediationData = await loadMediationData();

  // Convert mediation data warnings to WarningSignal format for compatibility
  const allWarnings: WarningSignal[] = mediationData.warnings.map((w) => ({
    id: w.id,
    messageId: "",
    senderName: "Unknown",
    category: w.category as WarningSignal["category"],
    severity: w.severity,
    flaggedAt: w.createdAt,
    title: w.title,
    description: w.description,
    excerpt: "",
    messageTimestamp: w.createdAt,
    dismissed: false,
  }));

  // ── Build Health Overview Data ──────────────────────────────────────────────
  const healthData: HealthOverviewData = {
    score: Math.max(0, Math.round(100 - climate.tensionScore)), // Invert: low tension = high health
    status:
      climate.level === "low"
        ? "excellent"
        : climate.level === "medium"
          ? "stable"
          : "at_risk",
    tensionLevel: climate.level,
    warningCount: allWarnings.length,
    conflictTrendPercent: 12, // Mock: would calculate vs. previous period
  };

  // Get conflict frequency for last 7 days
  const conflictFrequency = getConflictFrequencyData(allWarnings);

  // ── Get Mediation Topics ────────────────────────────────────────────────────
  const topics = mediationData.topics;
  const resolvedParams = await searchParams;
  const selectedTopicId = resolvedParams?.topicId;
  const selectedTopic = topics.find((t) => t.id === selectedTopicId);

  return (
    <div className="h-screen flex overflow-hidden bg-background-light dark:bg-background-dark">
      {/* Sidebar */}
      <MediationSidebar currentParent={mappedParent} />

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-background-light dark:bg-background-dark relative">
        {/* Header */}
        <header className="bg-surface-light dark:bg-surface-dark border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 px-8 py-4 flex justify-between items-center shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
              Mediation &amp; AI Assistant
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Manage disputes and monitor communication health.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/mediation/warnings"
              className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
            >
              View All Warnings →
            </Link>
            <button className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30 px-4 py-2 rounded-lg font-semibold text-sm transition-colors">
              <span className="material-symbols-outlined text-lg">gavel</span>
              Escalate to Professional
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="p-8 max-w-7xl mx-auto space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Health Overview */}
            <HealthOverviewCard data={healthData} conflictFrequency={conflictFrequency} />

            {/* Warnings Panel */}
            <WarningsPanel warnings={allWarnings.slice(0, 3)} />

            {/* AI Mediator */}
            <AIMediatorInterface topics={topics} selectedTopic={selectedTopic} />
          </div>
        </div>
      </main>
    </div>
  );
}
