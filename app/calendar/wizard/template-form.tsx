"use client";

import { useEffect, useState } from "react";
import { getSegmentWidthPercent, type ScheduleTemplate, type TemplateId } from "@/lib/schedule-wizard-engine";

interface TemplateFormProps {
  readonly templates: readonly ScheduleTemplate[];
  readonly defaultTemplateId: TemplateId;
  readonly action: (formData: FormData) => Promise<void>;
  readonly cancelAction: (formData: FormData) => Promise<void>;
}

export function TemplateForm({
  templates,
  defaultTemplateId,
  action,
  cancelAction,
}: TemplateFormProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId>(defaultTemplateId);
  const [mounted, setMounted] = useState(false);

  // Hydration guard: read from localStorage after mount
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const saved = localStorage.getItem("ks_wizard_draft");
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        if (draft.template) {
          // This setState is intentional during hydration - set once on mount
          setSelectedTemplate(draft.template);
        }
      } catch {
        // Ignore parse errors
      }
    }
    setMounted(true);
  }, []);

  // Write to localStorage whenever template changes
  useEffect(() => {
    if (!mounted) return;
    const draft = (() => {
      try {
        return JSON.parse(localStorage.getItem("ks_wizard_draft") || "{}");
      } catch {
        return {};
      }
    })();
    draft.template = selectedTemplate;
    localStorage.setItem("ks_wizard_draft", JSON.stringify(draft));
  }, [selectedTemplate, mounted]);

  const handleTemplateChange = (newTemplate: TemplateId) => {
    setSelectedTemplate(newTemplate);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData();
    formData.set("template", selectedTemplate);
    await action(formData);
  };

  const handleCancel = async (e: React.FormEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const formData = new FormData();
    await cancelAction(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-12">
      <div className="max-w-5xl mx-auto">
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
              const checked = selectedTemplate === template.id;

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
                    checked={checked}
                    onChange={() => handleTemplateChange(template.id)}
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
                        <span aria-hidden="true" className="material-symbols-outlined">
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
                          segment.parent === "A" ? "bg-primary" : "bg-parent-b";

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
            checked={selectedTemplate === "custom"}
            onChange={() => handleTemplateChange("custom")}
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
                className="material-symbols-outlined"
              >
                check
              </span>
            </div>
          </div>
        </label>
      </div>

      <div className="bg-surface dark:bg-surface border-t border-slate-200 dark:border-slate-800 p-4 sm:px-8 mt-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:justify-end gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 sm:px-6 py-2.5 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancel
          </button>

          <button
            type="submit"
            className={`px-4 sm:px-6 py-2.5 bg-primary hover:bg-primary-hover text-white font-semibold
              rounded-lg shadow-sm flex items-center justify-center sm:justify-start gap-2
              transition-colors`}
          >
            <span>Next Step</span>
            <span aria-hidden="true" className="material-symbols-outlined text-sm">
              arrow_forward
            </span>
          </button>
        </div>
      </div>
    </form>
  );
}
