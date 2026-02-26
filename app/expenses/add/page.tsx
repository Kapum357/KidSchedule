import { redirect } from "next/navigation";
import {
  EXPENSE_CATEGORY_OPTIONS,
  SPLIT_PRESETS,
  amountTextToCents,
  computeSplitSummary,
  formatCurrency,
  getTodayIsoDate,
  parseExpenseFormData,
  resolveYouPercent,
  type ExpenseSplitType,
  validateAddExpenseInput,
} from "@/lib/expense-engine";
import type { ExpenseCategory } from "@/types";

type ExpenseSearchParams = {
  name?: string;
  amount?: string;
  category?: string;
  date?: string;
  split?: string;
  custom?: string;
  success?: string;
  error?: string;
  receipt?: string;
};

type ExpensePageState = {
  expenseName: string;
  amountText: string;
  category: ExpenseCategory;
  dateIncurred: string;
  splitType: ExpenseSplitType;
  customYouPercent: number | null;
  errorMessage?: string;
  successMessage?: string;
  receiptMessage?: string;
};

function isCategory(value: string | undefined): value is ExpenseCategory {
  if (!value) {
    return false;
  }

  return EXPENSE_CATEGORY_OPTIONS.some((option) => option.value === value);
}

function isSplitType(value: string | undefined): value is ExpenseSplitType {
  return value === "equal" || value === "standard" || value === "custom";
}

function parseCustomPercent(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildQueryStringFromInput(input: {
  expenseName: string;
  amountText: string;
  category: ExpenseCategory;
  dateIncurred: string;
  splitType: ExpenseSplitType;
  customYouPercent: number | null;
}): string {
  const params = new URLSearchParams();
  if (input.expenseName) {
    params.set("name", input.expenseName);
  }
  if (input.amountText) {
    params.set("amount", input.amountText);
  }
  params.set("category", input.category);
  params.set("date", input.dateIncurred);
  params.set("split", input.splitType);
  if (input.customYouPercent !== null) {
    params.set("custom", String(Math.round(input.customYouPercent)));
  }
  return params.toString();
}

function resolvePageState(searchParams: ExpenseSearchParams | undefined): ExpensePageState {
  const splitType = isSplitType(searchParams?.split) ? searchParams.split : "equal";
  const customYouPercent = parseCustomPercent(searchParams?.custom);

  return {
    expenseName: (searchParams?.name ?? "").trim(),
    amountText: (searchParams?.amount ?? "").trim(),
    category: isCategory(searchParams?.category) ? searchParams.category : "medical",
    dateIncurred: searchParams?.date ?? getTodayIsoDate(),
    splitType,
    customYouPercent,
    errorMessage: searchParams?.error,
    successMessage: searchParams?.success === "1" ? "Expense logged successfully (demo mode)." : undefined,
    receiptMessage:
      searchParams?.receipt === "1"
        ? "Receipt selected. Cloud upload integration can be wired in persistence next."
        : undefined,
  };
}

async function handleAddExpense(formData: FormData): Promise<void> {
  "use server";

  const input = parseExpenseFormData(formData);
  const validation = validateAddExpenseInput(input);

  const baseParams = buildQueryStringFromInput({
    expenseName: input.expenseName,
    amountText: input.amountText,
    category: input.category,
    dateIncurred: input.dateIncurred,
    splitType: input.splitType,
    customYouPercent: input.customYouPercent,
  });

  if (!validation.valid) {
    const params = new URLSearchParams(baseParams);
    params.set("error", validation.error ?? "Could not log this expense.");
    redirect(`/expenses/add?${params.toString()}`);
  }

  const amountCents = amountTextToCents(input.amountText) ?? 0;
  computeSplitSummary(amountCents, input.splitType, input.customYouPercent);

  const success = new URLSearchParams(baseParams);
  success.set("success", "1");
  if (input.receiptFileName) {
    success.set("receipt", "1");
  }

  // Future persistence wiring point:
  // - insert Expense into lib/persistence boundary
  // - upload receipt to provider and store receiptUrl
  // - emit activity feed item
  redirect(`/expenses/add?${success.toString()}`);
}

export default async function AddExpensePage({
  searchParams,
}: Readonly<{ searchParams?: Promise<ExpenseSearchParams> }>) {
  const resolvedSearchParams = await searchParams;
  const state = resolvePageState(resolvedSearchParams);

  const amountCents = amountTextToCents(state.amountText) ?? 0;
  const splitSummary = computeSplitSummary(amountCents, state.splitType, state.customYouPercent);
  const normalizedCustom = resolveYouPercent(state.splitType, state.customYouPercent);

  return (
    <main id="main-content" className="bg-background-light dark:bg-background-dark font-display antialiased text-text-main h-screen flex flex-col overflow-hidden">
      <div className="flex flex-1 h-full">
        <aside className="hidden lg:flex lg:w-5/12 relative bg-primary/20 items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-primary/10 mix-blend-multiply z-10"></div>
          <div
            className="absolute w-full h-full bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://lh3.googleusercontent.com/aida-public/AB6AXuB2qbnKpG-L3elt6G4F38crsBEeLy_FKkttGPLFQ3zjLrnVcly8wdAkrSEtr0dwVxvMHuu_TV_9RsSdAbn7L7hCBlIqugdKXJqknMW2QHa8PuLJ_wPeHDuJP3Ow6_RjD41iy3qvi-UVmXfHnrqAOTbdCDRxO14GUdvybrCEq0GiN3PnqN407nHlCxUL9zYmJVd0r7oVkcHsGK38jEWUCOErOCqfrSVUt76TtsQn43Bx2Mnfi6SfRnKx73xXAY0wPxW8eAJGJfx-TqA')",
            }}
          ></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/10 z-20"></div>

          <div className="relative z-30 p-12 text-white max-w-lg">
            <div className="flex items-center gap-2 mb-6">
              <div className="bg-white/20 backdrop-blur-sm p-2 rounded-lg">
                <span className="material-symbols-outlined text-3xl">family_restroom</span>
              </div>
              <span className="text-2xl font-bold tracking-tight">KidSchedule</span>
            </div>

            <h2 className="text-3xl font-bold mb-4 leading-tight">Fair. Transparent. Documented.</h2>
            <p className="text-lg text-white/90 leading-relaxed">
              Log shared expenses easily to maintain a clear financial history and reduce conflict.
            </p>

            <div className="mt-8 space-y-4">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary-200 mt-1">receipt_long</span>
                <div>
                  <h4 className="font-semibold text-white">Track Every Cost</h4>
                  <p className="text-sm text-white/80">From medical bills to school supplies.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-primary-200 mt-1">pie_chart</span>
                <div>
                  <h4 className="font-semibold text-white">Split Fairly</h4>
                  <p className="text-sm text-white/80">Automated calculations based on custody agreement.</p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section className="w-full lg:w-7/12 flex flex-col overflow-y-auto bg-surface-light dark:bg-surface-dark relative">
          <div className="flex-1 w-full max-w-3xl mx-auto p-6 sm:p-12 lg:p-16">
            <div className="lg:hidden flex items-center gap-2 mb-8">
              <div className="bg-primary/10 flex items-center justify-center rounded-lg size-8 text-primary">
                <span className="material-symbols-outlined text-xl">family_restroom</span>
              </div>
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">KidSchedule</span>
            </div>

            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Add New Expense</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm">
                  Log a shared expense for reimbursement tracking.
                </p>
              </div>

              <a href="/expenses" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors" aria-label="Close">
                <span className="material-symbols-outlined">close</span>
              </a>
            </div>

            {state.errorMessage && (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/40 dark:bg-red-900/10 dark:text-red-300">
                {state.errorMessage}
              </div>
            )}

            {state.successMessage && (
              <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
                {state.successMessage}
              </div>
            )}

            {state.receiptMessage && (
              <div className="mb-6 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-800/40 dark:bg-sky-900/10 dark:text-sky-300">
                {state.receiptMessage}
              </div>
            )}

            <form action={handleAddExpense} className="space-y-8" encType="multipart/form-data">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 col-span-1 md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="expense-name">
                    Expense Name
                  </label>
                  <input
                    id="expense-name"
                    name="expenseName"
                    type="text"
                    defaultValue={state.expenseName}
                    placeholder="e.g. Fall Semester Soccer Cleats"
                    className="block w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark py-2.5 px-4 text-slate-900 dark:text-white shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="amount">
                    Total Amount
                  </label>
                  <div className="relative rounded-md shadow-sm">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <span className="text-slate-500 sm:text-sm">$</span>
                    </div>
                    <input
                      id="amount"
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      defaultValue={state.amountText}
                      placeholder="0.00"
                      className="block w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark py-2.5 pl-7 pr-12 text-slate-900 dark:text-white focus:border-primary focus:ring-primary sm:text-sm"
                      required
                    />
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      <span className="text-slate-500 sm:text-sm">USD</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="category">
                    Category
                  </label>
                  <select
                    id="category"
                    name="category"
                    defaultValue={state.category}
                    className="block w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark py-2.5 px-4 text-slate-900 dark:text-white shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                  >
                    {EXPENSE_CATEGORY_OPTIONS.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="date">
                    Date Incurred
                  </label>
                  <div className="relative">
                    <input
                      id="date"
                      name="dateIncurred"
                      type="date"
                      defaultValue={state.dateIncurred}
                      max={getTodayIsoDate()}
                      className="block w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark py-2.5 px-4 text-slate-900 dark:text-white shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                      required
                    />
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      <span className="material-symbols-outlined text-slate-400 text-lg">calendar_today</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 my-6"></div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Split Arrangement</p>
                  <span className="text-xs text-primary bg-primary/10 px-2 py-1 rounded-full font-medium">Default: 50/50</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {SPLIT_PRESETS.map((preset) => {
                    const checked = state.splitType === preset.id;
                    const selectedStyle = checked
                      ? "bg-primary/5 border-primary"
                      : "border-slate-200 dark:border-slate-700 hover:border-primary/50";

                    return (
                      <label key={preset.id} className={`relative flex cursor-pointer rounded-lg border p-4 shadow-sm focus:outline-none ${selectedStyle}`}>
                        <input
                          className="sr-only"
                          name="splitType"
                          type="radio"
                          value={preset.id}
                          defaultChecked={checked}
                        />
                        <span className="flex flex-1">
                          <span className="flex flex-col">
                            <span className="block text-sm font-medium text-slate-900 dark:text-white">{preset.label}</span>
                            <span className="mt-1 flex items-center text-xs text-slate-500 dark:text-slate-400">{preset.subtitle}</span>
                          </span>
                        </span>
                        <span className={`material-symbols-outlined ${checked ? "text-primary" : "text-transparent"}`}>check_circle</span>
                      </label>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2 sm:col-span-1">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide" htmlFor="customYouPercent">
                      Custom split (your %)
                    </label>
                    <input
                      id="customYouPercent"
                      name="customYouPercent"
                      type="number"
                      min={1}
                      max={99}
                      step={1}
                      defaultValue={state.splitType === "custom" ? normalizedCustom : 50}
                      className="block w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-background-dark py-2.5 px-4 text-slate-900 dark:text-white focus:border-primary focus:ring-primary sm:text-sm"
                    />
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 mt-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">Your Share ({splitSummary.youPercent}%)</span>
                    <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(splitSummary.youShareCents)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-300">Other Parent&apos;s Share ({splitSummary.otherPercent}%)</span>
                    <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(splitSummary.otherShareCents)}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 my-6"></div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="file-upload">
                  Documentation
                </label>
                <div className="mt-2 flex justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-6 py-10 bg-slate-50 dark:bg-background-dark hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer group">
                  <div className="text-center">
                    <span className="material-symbols-outlined text-4xl text-slate-300 group-hover:text-primary transition-colors">cloud_upload</span>
                    <div className="mt-4 flex text-sm leading-6 text-slate-600 dark:text-slate-400 justify-center">
                      <label htmlFor="file-upload" className="relative cursor-pointer rounded-md font-semibold text-primary focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 hover:text-primary-hover">
                        <span>Upload a receipt</span>
                        <input className="sr-only" id="file-upload" name="receipt" type="file" accept="image/png,image/jpeg,application/pdf" />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs leading-5 text-slate-500 dark:text-slate-500">PNG, JPG, PDF up to 10MB</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-6">
                <a
                  href="/expenses"
                  className="w-full sm:w-auto text-center rounded-full px-6 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </a>
                <button
                  type="submit"
                  className="w-full sm:w-auto inline-flex justify-center rounded-full bg-primary px-8 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-all duration-200"
                >
                  Log Expense
                </button>
              </div>
            </form>

            <div className="mt-8 text-center text-xs text-slate-400">
              <p>Recorded expenses are visible to both parties immediately upon submission.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
