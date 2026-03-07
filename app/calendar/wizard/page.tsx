import {
  getScheduleTemplates,
  getWizardSteps,
  isTemplateId,
  type TemplateId,
} from "@/lib/schedule-wizard-engine";
import { redirect } from "next/navigation";
import { TemplateForm } from "./template-form";

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

async function cancelWizard(): Promise<void> {
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

          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 sm:p-8 lg:p-12">
                <div className="max-w-5xl mx-auto mb-8">
                  <WizardProgress />
                </div>
              </div>
            </div>
            <TemplateForm
              templates={templates}
              defaultTemplateId={selectedTemplateId}
              action={startNextStep}
              cancelAction={cancelWizard}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
