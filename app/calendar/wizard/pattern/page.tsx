import {
  generatePatternPreview,
  getDefaultPatternConfig,
  getDropoffTimeOptions,
  getPickupTimeOptions,
  isTemplateId,
  type PatternConfigInput,
  type PreviewMode,
  type RotationStarter,
  type TemplateId,
} from "@/lib/schedule-wizard-engine";
import { PatternConfigForm } from "./pattern-config-form";

const WEEKDAY_HEADERS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

type PatternSearchParams = {
  template?: string;
  startDate?: string;
  startsWith?: string;
  pickup?: string;
  dropoff?: string;
  mode?: string;
  draftSaved?: string;
};

function isValidIsoDate(value: string | undefined): value is string {
  if (!value) {return false;}
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function resolveConfig(searchParams?: PatternSearchParams): PatternConfigInput {
  const templateId: TemplateId = isTemplateId(searchParams?.template)
    ? searchParams.template
    : "2-2-3";

  const defaults = getDefaultPatternConfig(templateId);
  const pickupOptions = getPickupTimeOptions();
  const dropoffOptions = getDropoffTimeOptions();

  const scheduleStartDate = isValidIsoDate(searchParams?.startDate)
    ? searchParams.startDate
    : defaults.scheduleStartDate;

  const rotationStarter: RotationStarter =
    searchParams?.startsWith === "B" ? "B" : "A";

  const pickupTime = pickupOptions.includes(searchParams?.pickup ?? "")
    ? (searchParams?.pickup as string)
    : defaults.pickupTime;

  const dropoffTime = dropoffOptions.includes(searchParams?.dropoff ?? "")
    ? (searchParams?.dropoff as string)
    : defaults.dropoffTime;

  const mode: PreviewMode = searchParams?.mode === "monthly" ? "monthly" : "bi-weekly";

  return {
    templateId,
    scheduleStartDate,
    rotationStarter,
    pickupTime,
    dropoffTime,
    mode,
  };
}

function toQueryString(config: PatternConfigInput, extras?: Record<string, string | undefined>): string {
  const query = new URLSearchParams({
    template: config.templateId,
    startDate: config.scheduleStartDate,
    startsWith: config.rotationStarter,
    pickup: config.pickupTime,
    dropoff: config.dropoffTime,
    mode: config.mode,
  });

  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      if (!value) {
        query.delete(key);
      } else {
        query.set(key, value);
      }
    }
  }

  return query.toString();
}

export default async function PatternConfigPage({
  searchParams,
}: Readonly<{ searchParams?: Promise<PatternSearchParams> }>) {
  const resolvedSearchParams = await searchParams;
  const config = resolveConfig(resolvedSearchParams);
  const preview = generatePatternPreview(config);
  const draftSaved = resolvedSearchParams?.draftSaved === "1";

  const biWeeklyHref = `/calendar/wizard/pattern?${toQueryString(config, { mode: "bi-weekly", draftSaved: undefined })}`;
  const monthlyHref = `/calendar/wizard/pattern?${toQueryString(config, { mode: "monthly", draftSaved: undefined })}`;
  const saveDraftHref = `/calendar/wizard/pattern?${toQueryString(config, { draftSaved: "1" })}`;
  const backHref = `/calendar/wizard?template=${encodeURIComponent(config.templateId)}`;

  return (
    <div className="bg-surface-sunken dark:bg-surface-sunken font-display antialiased text-slate-900 dark:text-slate-100 min-h-screen flex flex-col overflow-hidden">
      <header className="bg-surface dark:bg-surface border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between shrink-0 h-16">
        <div className="flex items-center gap-2">
          <div className="bg-primary/20 p-1.5 rounded-lg text-primary">
            <span className="material-symbols-outlined text-2xl" aria-hidden="true">
              family_restroom
            </span>
          </div>
          <span className="text-xl font-bold tracking-tight">KidSchedule</span>
        </div>

        <div className="hidden md:flex items-center gap-2 text-sm">
          <div className="flex items-center gap-2 text-slate-400">
            <div className="w-6 h-6 rounded-full border border-slate-300 flex items-center justify-center text-xs">
              1
            </div>
            <span>Template</span>
          </div>
          <div className="w-8 h-px bg-slate-300"></div>
          <div className="flex items-center gap-2 text-primary font-semibold">
            <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs">
              2
            </div>
            <span>Pattern Config</span>
          </div>
          <div className="w-8 h-px bg-slate-300"></div>
          <div className="flex items-center gap-2 text-slate-400">
            <div className="w-6 h-6 rounded-full border border-slate-300 flex items-center justify-center text-xs">
              3
            </div>
            <span>Review</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <a
            className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            href={saveDraftHref}
          >
            Save Draft
          </a>
          <button className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full" type="button" aria-label="Help">
            <span className="material-symbols-outlined" aria-hidden="true">
              help
            </span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden">
        <PatternConfigForm
          config={config}
          pickupOptions={getPickupTimeOptions()}
          dropoffOptions={getDropoffTimeOptions()}
          templateId={config.templateId}
          mode={config.mode}
        />

        <section className="w-full lg:w-2/3 xl:w-3/4 bg-surface-sunken dark:bg-surface-sunken p-6 lg:p-10 overflow-y-auto flex flex-col relative">
          <div className="max-w-5xl mx-auto w-full h-full flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Schedule Preview</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Visualizing {preview.rangeLabel}</p>
              </div>
              <div className="flex items-center gap-3 bg-white dark:bg-surface p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                <a
                  href={biWeeklyHref}
                  className={`px-3 py-1.5 text-sm font-medium rounded ${
                    config.mode === "bi-weekly"
                      ? "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  Bi-Weekly
                </a>
                <a
                  href={monthlyHref}
                  className={`px-3 py-1.5 text-sm font-medium rounded ${
                    config.mode === "monthly"
                      ? "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  Monthly
                </a>
              </div>
            </div>

            <div className="bg-white dark:bg-surface rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex-1 overflow-hidden flex flex-col">
              <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                {WEEKDAY_HEADERS.map((weekday) => (
                  <div key={weekday} className="p-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {weekday}
                  </div>
                ))}
              </div>

              {preview.weeks.map((week, weekIndex) => (
                <div key={`week-${weekIndex}`} className="flex-1 grid grid-cols-7 divide-x divide-slate-100 dark:divide-slate-800 min-h-[160px] border-b last:border-b-0 border-slate-200 dark:border-slate-800">
                  {week.map((day) => {
                    const dayColor = day.parent === "A" ? "primary" : "parent-b";
                    const textColor = day.parent === "A" ? "text-primary" : "text-parent-b";

                    return (
                      <div
                        key={day.isoDate}
                        className={`relative p-2 flex flex-col group transition-colors ${
                          dayColor === "primary"
                            ? "bg-primary/5 hover:bg-primary/10"
                            : "bg-parent-b/5 hover:bg-parent-b/10"
                        }`}
                      >
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{day.dayOfMonth}</span>
                        <div
                          className={`flex-1 rounded-lg p-2 border-l-4 ${
                            dayColor === "primary"
                              ? "bg-primary/20 border-primary"
                              : "bg-parent-b/20 border-parent-b"
                          }`}
                        >
                          <div className={`text-xs font-bold ${textColor}`}>Parent {day.parent}</div>
                          <div className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">{day.details}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-center gap-6 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-primary"></div>
                <span>Parent A ({preview.parentAPercent}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-parent-b"></div>
                <span>Parent B ({preview.parentBPercent}%)</span>
              </div>
            </div>

            {draftSaved && (
              <div className="mt-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
                Draft saved just now.
              </div>
            )}
          </div>
        </section>

        <footer className="fixed bottom-0 left-0 w-full bg-surface dark:bg-surface border-t border-slate-200 dark:border-slate-800 p-4 lg:px-8 z-50">
          <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
            <a
              href={backHref}
              className="inline-flex items-center justify-center rounded-full bg-white dark:bg-slate-800 px-6 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              Back
            </a>

            <div className="hidden sm:flex text-sm text-slate-500">
              <span>{draftSaved ? "Draft saved just now" : "Draft not saved"}</span>
            </div>

            <form method="get" action="/calendar/wizard/review">
              <input type="hidden" name="template" value={config.templateId} />
              <input type="hidden" name="startDate" value={config.scheduleStartDate} />
              <input type="hidden" name="startsWith" value={config.rotationStarter} />
              <input type="hidden" name="pickup" value={config.pickupTime} />
              <input type="hidden" name="dropoff" value={config.dropoffTime} />
              <input type="hidden" name="mode" value={config.mode} />

              <button
                className="inline-flex items-center justify-center rounded-full bg-primary px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-all"
                type="submit"
              >
                Next Step
                <span className="material-symbols-outlined ml-2 text-lg" aria-hidden="true">
                  arrow_forward
                </span>
              </button>
            </form>
          </div>
        </footer>
      </main>
    </div>
  );
}
