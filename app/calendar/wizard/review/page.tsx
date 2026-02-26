import {
  generatePatternPreview,
  getDefaultPatternConfig,
  isTemplateId,
  resolveTemplate,
  type PatternConfigInput,
  type PreviewMode,
  type RotationStarter,
  type TemplateId,
} from "@/lib/schedule-wizard-engine";

type ReviewSearchParams = {
  template?: string;
  startDate?: string;
  startsWith?: string;
  pickup?: string;
  dropoff?: string;
  mode?: string;
};

function isValidIsoDate(value: string | undefined): value is string {
  if (!value) {
    return false;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function resolveReviewConfig(searchParams?: ReviewSearchParams): PatternConfigInput {
  const templateId: TemplateId = isTemplateId(searchParams?.template)
    ? searchParams.template
    : "2-2-3";
  const defaults = getDefaultPatternConfig(templateId);

  const rotationStarter: RotationStarter = searchParams?.startsWith === "B" ? "B" : "A";
  const mode: PreviewMode = searchParams?.mode === "monthly" ? "monthly" : "bi-weekly";

  return {
    templateId,
    scheduleStartDate: isValidIsoDate(searchParams?.startDate)
      ? searchParams.startDate
      : defaults.scheduleStartDate,
    rotationStarter,
    pickupTime: searchParams?.pickup ?? defaults.pickupTime,
    dropoffTime: searchParams?.dropoff ?? defaults.dropoffTime,
    mode,
  };
}

function toQueryString(config: PatternConfigInput): string {
  return new URLSearchParams({
    template: config.templateId,
    startDate: config.scheduleStartDate,
    startsWith: config.rotationStarter,
    pickup: config.pickupTime,
    dropoff: config.dropoffTime,
    mode: config.mode,
  }).toString();
}

export default async function ReviewPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<ReviewSearchParams> }>) {
  const resolvedParams = await searchParams;
  const config = resolveReviewConfig(resolvedParams);
  const preview = generatePatternPreview(config);
  const template = resolveTemplate(config.templateId);

  const backHref = `/calendar/wizard/pattern?${toQueryString(config)}`;
  const finishHref = `/calendar?wizard=completed&template=${encodeURIComponent(config.templateId)}`;

  return (
    <div className="min-h-screen bg-surface-sunken dark:bg-surface-sunken text-slate-900 dark:text-slate-100 p-6 sm:p-10">
      <div className="max-w-3xl mx-auto bg-white dark:bg-surface rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Step 3 of 3</p>
            <h1 className="text-2xl font-bold">Review Your Schedule</h1>
          </div>
          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
            Ready to save
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Template</p>
            <p className="font-semibold">{template.title}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Start Date</p>
            <p className="font-semibold">{config.scheduleStartDate}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Rotation Starts With</p>
            <p className="font-semibold">Parent {config.rotationStarter}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Transition Time</p>
            <p className="font-semibold">{config.pickupTime}</p>
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 p-4 mb-8">
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">Preview Range</p>
          <p className="font-semibold mb-3">{preview.rangeLabel}</p>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <span className="inline-flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary"></span>
              Parent A ({preview.parentAPercent}%)
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-secondary"></span>
              Parent B ({preview.parentBPercent}%)
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <a
            href={backHref}
            className="inline-flex items-center justify-center rounded-full bg-white dark:bg-slate-800 px-6 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            Back
          </a>
          <a
            href={finishHref}
            className="inline-flex items-center justify-center rounded-full bg-primary px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
          >
            Confirm & Finish
          </a>
        </div>
      </div>
    </div>
  );
}
