/**
 * KidSchedule – Schedule Wizard Engine
 *
 * Pure domain logic for the schedule template step of the wizard.
 *
 * Complexity notes:
 * - Template resolution: O(T), where T = number of templates (small constant).
 * - Segment rendering prep: O(S), where S = number of segments per template.
 *
 * With the current catalog (4 templates, <= 4 segments), this is effectively O(1).
 */

export type WizardStepId = 1 | 2 | 3;

export type TemplateId = "2-2-3" | "alternating-weeks" | "2-2-5-5" | "custom";

export interface TemplateSegment {
  days: number;
  parent: "A" | "B";
}

export interface ScheduleTemplate {
  id: TemplateId;
  title: string;
  description: string;
  icon: string;
  iconTheme: string;
  segments: TemplateSegment[];
}

export interface WizardStep {
  id: WizardStepId;
  label: string;
}

export type RotationStarter = "A" | "B";

export type PreviewMode = "bi-weekly" | "monthly";

export interface PatternConfigInput {
  templateId: TemplateId;
  scheduleStartDate: string;
  rotationStarter: RotationStarter;
  pickupTime: string;
  dropoffTime: string;
  mode: PreviewMode;
}

export interface PatternPreviewDay {
  isoDate: string;
  dayOfMonth: number;
  weekdayLabel: string;
  parent: "A" | "B";
  details: string;
  isHandoff: boolean;
}

export interface PatternPreview {
  days: PatternPreviewDay[];
  weeks: PatternPreviewDay[][];
  rangeLabel: string;
  parentADays: number;
  parentBDays: number;
  parentAPercent: number;
  parentBPercent: number;
}

const TEMPLATE_CATALOG: readonly ScheduleTemplate[] = [
  {
    id: "2-2-3",
    title: "2-2-3 Rotating",
    description:
      "Children spend 2 days with one parent, 2 days with the other, then 3 days with the first parent. The cycle rotates each week.",
    icon: "sync_alt",
    iconTheme: "bg-primary/10 text-primary",
    segments: [
      { days: 2, parent: "A" },
      { days: 2, parent: "B" },
      { days: 3, parent: "A" },
      { days: 2, parent: "B" },
      { days: 2, parent: "A" },
      { days: 3, parent: "B" },
    ],
  },
  {
    id: "alternating-weeks",
    title: "Alternating Weeks",
    description:
      "Children spend one full week with one parent, and the next full week with the other parent. Simple and consistent.",
    icon: "date_range",
    iconTheme: "bg-orange-100 text-orange-500",
    segments: [
      { days: 7, parent: "A" },
      { days: 7, parent: "B" },
    ],
  },
  {
    id: "2-2-5-5",
    title: "2-2-5-5 Schedule",
    description:
      "2 days with Parent A, 2 days with Parent B, then 5 days with Parent A, followed by 5 days with Parent B.",
    icon: "event_repeat",
    iconTheme: "bg-blue-100 text-blue-500",
    segments: [
      { days: 2, parent: "A" },
      { days: 2, parent: "B" },
      { days: 5, parent: "A" },
      { days: 5, parent: "B" },
    ],
  },
  {
    id: "custom",
    title: "Build a Custom Schedule",
    description: "Start from scratch and build a schedule that fits your unique needs.",
    icon: "edit_calendar",
    iconTheme: "bg-slate-100 text-slate-500",
    segments: [],
  },
] as const;

const WIZARD_STEPS: readonly WizardStep[] = [
  { id: 1, label: "Template" },
  { id: 2, label: "Pattern Config" },
  { id: 3, label: "Review" },
] as const;

const PICKUP_TIME_OPTIONS = [
  "08:00 AM - School Drop-off",
  "03:00 PM - After School",
  "05:00 PM - Evening",
  "06:00 PM",
] as const;

const DROPOFF_TIME_OPTIONS = [
  "Same as Pick-up",
  "09:00 AM",
  "06:00 PM",
] as const;

export function getScheduleTemplates(): readonly ScheduleTemplate[] {
  return TEMPLATE_CATALOG;
}

export function getWizardSteps(): readonly WizardStep[] {
  return WIZARD_STEPS;
}

export function getPickupTimeOptions(): readonly string[] {
  return PICKUP_TIME_OPTIONS;
}

export function getDropoffTimeOptions(): readonly string[] {
  return DROPOFF_TIME_OPTIONS;
}

export function getDefaultScheduleStartDate(referenceDate: Date = new Date()): string {
  const candidate = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
  );

  while (candidate.getUTCDay() !== 1) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }

  return toIsoDate(candidate);
}

export function getDefaultPatternConfig(templateId: TemplateId = "2-2-3"): PatternConfigInput {
  return {
    templateId,
    scheduleStartDate: getDefaultScheduleStartDate(),
    rotationStarter: "A",
    pickupTime: "03:00 PM - After School",
    dropoffTime: "Same as Pick-up",
    mode: "bi-weekly",
  };
}

export function isTemplateId(value: string | undefined | null): value is TemplateId {
  if (!value) {
    return false;
  }

  return TEMPLATE_CATALOG.some((template) => template.id === value);
}

export function resolveTemplate(value: string | undefined | null): ScheduleTemplate {
  if (!isTemplateId(value)) {
    return TEMPLATE_CATALOG[0];
  }

  const selected = TEMPLATE_CATALOG.find((template) => template.id === value);
  return selected ?? TEMPLATE_CATALOG[0];
}

export function getSegmentWidthPercent(template: ScheduleTemplate, segment: TemplateSegment): number {
  const totalDays = template.segments.reduce((acc, current) => acc + current.days, 0);

  if (totalDays === 0) {
    return 0;
  }

  return (segment.days / totalDays) * 100;
}

function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoDateOrFallback(value: string, fallbackIsoDate: string): Date {
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoRegex.test(value)) {
    return new Date(`${fallbackIsoDate}T00:00:00.000Z`);
  }

  return new Date(`${value}T00:00:00.000Z`);
}

function normalizeSegments(templateId: TemplateId, starter: RotationStarter): TemplateSegment[] {
  const base = resolveTemplate(templateId);
  const baseSegments = base.segments.length > 0 ? base.segments : resolveTemplate("2-2-3").segments;

  if (starter === "A") {
    return [...baseSegments];
  }

  return baseSegments.map((segment) => ({
    ...segment,
    parent: segment.parent === "A" ? "B" : "A",
  }));
}

function pickupLabel(pickupTime: string): string {
  const [time] = pickupTime.split(" - ");
  return `Pickup @ ${time}`;
}

function formatRangeDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function chunkWeek(days: PatternPreviewDay[]): PatternPreviewDay[][] {
  const weeks: PatternPreviewDay[][] = [];

  for (let idx = 0; idx < days.length; idx += 7) {
    weeks.push(days.slice(idx, idx + 7));
  }

  return weeks;
}

function buildPreviewSequence(
  start: Date,
  segments: TemplateSegment[],
  daysToGenerate: number,
  pickupTime: string
): { days: PatternPreviewDay[]; parentADays: number; parentBDays: number } {
  const days: PatternPreviewDay[] = [];
  let segmentIndex = 0;
  let daysRemaining = segments[segmentIndex]?.days ?? 0;
  let previousParent: "A" | "B" | null = null;
  let parentADays = 0;
  let parentBDays = 0;

  for (let dayOffset = 0; dayOffset < daysToGenerate; dayOffset++) {
    const currentDate = new Date(start);
    currentDate.setUTCDate(start.getUTCDate() + dayOffset);

    const segment = segments[segmentIndex] ?? { parent: "A" as const, days: 1 };
    const currentParent = segment.parent;
    const isHandoff = previousParent !== null && previousParent !== currentParent;

    if (currentParent === "A") {
      parentADays += 1;
    } else {
      parentBDays += 1;
    }

    days.push({
      isoDate: toIsoDate(currentDate),
      dayOfMonth: currentDate.getUTCDate(),
      weekdayLabel: currentDate
        .toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })
        .toUpperCase(),
      parent: currentParent,
      details: isHandoff ? pickupLabel(pickupTime) : "Full Day",
      isHandoff,
    });

    previousParent = currentParent;
    daysRemaining -= 1;

    if (daysRemaining <= 0) {
      segmentIndex = (segmentIndex + 1) % Math.max(segments.length, 1);
      daysRemaining = segments[segmentIndex]?.days ?? 1;
    }
  }

  return { days, parentADays, parentBDays };
}

export function generatePatternPreview(config: PatternConfigInput): PatternPreview {
  const fallbackStartDate = getDefaultScheduleStartDate();
  const start = parseIsoDateOrFallback(config.scheduleStartDate, fallbackStartDate);

  const daysToGenerate = config.mode === "bi-weekly" ? 14 : 28;
  const segments = normalizeSegments(config.templateId, config.rotationStarter);

  const sequence = buildPreviewSequence(start, segments, daysToGenerate, config.pickupTime);
  const { days, parentADays, parentBDays } = sequence;

  const rangeStart = days[0] ? new Date(`${days[0].isoDate}T00:00:00.000Z`) : start;
  const rangeEnd = days[days.length - 1]
    ? new Date(`${days[days.length - 1].isoDate}T00:00:00.000Z`)
    : start;
  const totalDays = Math.max(parentADays + parentBDays, 1);
  const parentAPercent = Math.round((parentADays / totalDays) * 100);
  const parentBPercent = 100 - parentAPercent;
  const weekCount = Math.ceil(daysToGenerate / 7);

  return {
    days,
    weeks: chunkWeek(days),
    rangeLabel: `${formatRangeDate(rangeStart)} - ${formatRangeDate(rangeEnd)} (${weekCount} Week Rotation)`,
    parentADays,
    parentBDays,
    parentAPercent,
    parentBPercent,
  };
}
