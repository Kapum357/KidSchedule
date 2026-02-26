import {
  getScheduleTemplates,
  getSegmentWidthPercent,
  getWizardSteps,
  isTemplateId,
  type TemplateId,
} from "@/lib/schedule-wizard-engine";
import { redirect } from "next/navigation";

async function startNextStep(formData: FormData): Promise<void> {
  "use server";

  const selectedTemplate = (formData.get("template") as string | null) ?? "";
  const params = new URLSearchParams();

  if (isTemplateId(selectedTemplate)) {
    params.set("template", selectedTemplate);
  } else {
    params.set("template", "2-2-3");
  }

  redirect(`/calendar/wizard/pattern?${params.toString()}`);
}

async function cancelWizard(_: FormData): Promise<void> {
  "use server";
  redirect("/calendar");
}

function WizardProgress() {
  const steps = getWizardSteps();

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between relative">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-full -z-10" />
        {steps.map((step) => {
          const isActive = step.id === 1;
          const isDone = step.id < 1;
          let stepCircleClass = "";

          if (isActive) {
            stepCircleClass = "bg-primary text-white";
          } else if (isDone) {
            stepCircleClass = "bg-primary/20 text-primary";
          } else {
            stepCircleClass = "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400";
          }

          return (
            <div
              key={step.id}
              className="flex flex-col items-center gap-2 bg-surface dark:bg-surface px-2"
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ring-4 ring-surface dark:ring-surface z-10 ${stepCircleClass}`}
              >
                {isActive ? (
                  <span aria-hidden="true" className="material-symbols-outlined text-xl">
                    view_agenda
                  </span>
                ) : (
                  <span className="text-sm font-semibold">{step.id}</span>
                )}
              </div>
              <span
                className={`text-sm ${
                  isActive
                    ? "font-bold text-primary"
                    : "font-medium text-slate-500 dark:text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function ScheduleWizardPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<{ template?: string }>;
}>) {
  const resolvedSearchParams = await searchParams;
  const selectedTemplateId = (resolvedSearchParams?.template as TemplateId | undefined) ?? "2-2-3";
  const templates = getScheduleTemplates();

  return (
    <div className="min-h-screen bg-surface-sunken dark:bg-surface-sunken flex flex-col">
      <div className="flex flex-1 h-full">
        <aside className="hidden lg:flex w-64 bg-surface dark:bg-surface border-r border-slate-200 dark:border-slate-800 flex-col">
          <div className="p-6">
            <div className="flex items-center gap-2">
              <div className="bg-primary/20 p-2 rounded-lg">
                <span aria-hidden="true" className="material-symbols-outlined text-primary text-2xl">
                  family_restroom
                </span>
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">
                KidSchedule
              </span>
            </div>
          </div>

          <nav className="flex-1 px-4 space-y-2 mt-4" aria-label="Primary navigation">
            <a
              className="flex items-center gap-3 px-4 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
              href="/dashboard"
            >
              <span aria-hidden="true" className="material-symbols-outlined">
                dashboard
              </span>
              <span>Dashboard</span>
            </a>
            <a
              className="flex items-center gap-3 px-4 py-3 bg-primary/10 text-primary font-semibold rounded-lg transition-colors"
              href="/calendar"
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                calendar_month
              </span>
              <span>Schedule</span>
            </a>
            <a
              className="flex items-center gap-3 px-4 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
              href="/messages"
            >
              <span aria-hidden="true" className="material-symbols-outlined">
                chat
              </span>
              <span>Messages</span>
            </a>
            <a
              className="flex items-center gap-3 px-4 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
              href="/expenses"
            >
              <span aria-hidden="true" className="material-symbols-outlined">
                account_balance_wallet
              </span>
              <span>Expenses</span>
            </a>
          </nav>

          <div className="p-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 px-4 py-2">
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 font-bold text-xs">
                JS
              </div>
              <div className="text-sm">
                <div className="font-medium text-slate-900 dark:text-white">John Smith</div>
                <div className="text-slate-500 text-xs">View Profile</div>
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col h-full relative">
          <div className="lg:hidden h-16 bg-surface dark:bg-surface border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="material-symbols-outlined text-primary text-2xl">
                family_restroom
              </span>
              <span className="text-lg font-bold text-slate-800 dark:text-white">KidSchedule</span>
            </div>
            <button className="text-slate-500" aria-label="Open menu">
              <span aria-hidden="true" className="material-symbols-outlined">
                menu
              </span>
            </button>
          </div>

          <form action={startNextStep} className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-12">
            <div className="max-w-5xl mx-auto">
              <WizardProgress />

              <div className="mb-8 text-center sm:text-left">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                  Choose a schedule template
                </h1>
                <p className="text-slate-600 dark:text-slate-300 text-lg">
                  Select a starting point for your custody plan. You can customize the details in the next step.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {templates
                  .filter((template) => template.id !== "custom")
                  .map((template) => {
                    const checked = selectedTemplateId === template.id;

                    return (
                      <label
                        key={template.id}
                        className="relative group cursor-pointer"
                        aria-label={`Select ${template.title}`}
                      >
                        <input
                          className="peer sr-only"
                          name="template"
                          type="radio"
                          value={template.id}
                          defaultChecked={checked}
                        />

                        <div
                          className={`h-full bg-surface dark:bg-surface border-2 rounded-xl p-6 shadow-sm peer-checked:ring-2 peer-checked:ring-primary peer-checked:ring-offset-2 dark:peer-checked:ring-offset-surface-sunken transition-all hover:shadow-md flex flex-col ${
                            checked
                              ? "border-primary"
                              : "border-transparent hover:border-primary/50"
                          }`}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div
                              className={`w-12 h-12 rounded-lg flex items-center justify-center ${template.iconTheme}`}
                            >
                              <span aria-hidden="true" className="material-symbols-outlined text-2xl">
                                {template.icon}
                              </span>
                            </div>

                            <div
                              className={`text-primary transition-opacity ${
                                checked
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-50 peer-checked:opacity-100"
                              }`}
                            >
                              <span aria-hidden="true" className="material-symbols-outlined">
                                check_circle
                              </span>
                            </div>
                          </div>

                          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                            {template.title}
                          </h3>
                          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4 flex-1">
                            {template.description}
                          </p>

                          <div className="flex gap-1 mt-auto" aria-hidden="true">
                            {template.segments.map((segment, idx) => {
                              const width = getSegmentWidthPercent(template, segment);
                              const segmentClass =
                                segment.parent === "A" ? "bg-primary" : "bg-slate-300 dark:bg-slate-600";

                              return (
                                <div
                                  key={`${template.id}-${idx}-${segment.days}`}
                                  className={`h-2 rounded-full ${segmentClass}`}
                                  style={{ width: `${width}%` }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </label>
                    );
                  })}
              </div>

              <label className="block cursor-pointer" aria-label="Select custom schedule template">
                <input
                  className="peer sr-only"
                  name="template"
                  type="radio"
                  value="custom"
                  defaultChecked={selectedTemplateId === "custom"}
                />

                <div className="bg-white dark:bg-surface border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-center gap-4 hover:border-primary peer-checked:border-primary peer-checked:bg-primary/5 dark:peer-checked:bg-primary/10 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center flex-shrink-0">
                    <span aria-hidden="true" className="material-symbols-outlined">
                      edit_calendar
                    </span>
                  </div>

                  <div className="flex-1">
                    <h4 className="font-bold text-slate-900 dark:text-white">Build a Custom Schedule</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Start from scratch and build a schedule that fits your unique needs.
                    </p>
                  </div>

                  <div className="w-6 h-6 rounded-full border-2 border-slate-300 dark:border-slate-600 peer-checked:border-primary peer-checked:bg-primary flex items-center justify-center">
                    <span
                      aria-hidden="true"
                      className="material-symbols-outlined text-white text-sm opacity-0 peer-checked:opacity-100"
                    >
                      check
                    </span>
                  </div>
                </div>
              </label>
            </div>

            <div className="bg-surface dark:bg-surface border-t border-slate-200 dark:border-slate-800 p-4 sm:px-8 mt-8">
              <div className="max-w-5xl mx-auto flex justify-end gap-3">
                <button
                  type="submit"
                  formAction={cancelWizard}
                  className="px-6 py-2.5 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-white font-semibold rounded-lg shadow-sm flex items-center gap-2 transition-colors"
                >
                  <span>Next Step</span>
                  <span aria-hidden="true" className="material-symbols-outlined text-sm">
                    arrow_forward
                  </span>
                </button>
              </div>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
