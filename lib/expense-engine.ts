/**
 * KidSchedule – Expense Engine
 *
 * Pure domain helpers for the Add Expense flow.
 *
 * Complexity:
 * - Parsing and validation are O(1) per submission.
 * - Split calculation is O(1).
 */

import type { ExpenseCategory } from "@/types";

export type ExpenseSplitType = "equal" | "standard" | "custom";

export type ExpenseCategoryOption = {
  value: ExpenseCategory;
  label: string;
};

export type SplitPreset = {
  id: ExpenseSplitType;
  label: string;
  subtitle: string;
  defaultYouPercent: number;
};

export type AddExpenseInput = {
  expenseName: string;
  amountText: string;
  category: ExpenseCategory;
  dateIncurred: string;
  splitType: ExpenseSplitType;
  customYouPercent: number | null;
  receiptFileName?: string;
};

export type AddExpenseValidation = {
  valid: boolean;
  error?: string;
};

export type SplitSummary = {
  youPercent: number;
  otherPercent: number;
  youShareCents: number;
  otherShareCents: number;
};

export const EXPENSE_CATEGORY_OPTIONS: readonly ExpenseCategoryOption[] = [
  { value: "medical", label: "Medical & Health" },
  { value: "education", label: "Education & Tuition" },
  { value: "activity", label: "Extracurricular Activities" },
  { value: "clothing", label: "Clothing & Necessities" },
  { value: "childcare", label: "Childcare" },
  { value: "other", label: "Other" },
] as const;

export const SPLIT_PRESETS: readonly SplitPreset[] = [
  {
    id: "equal",
    label: "Equal Split",
    subtitle: "50% / 50%",
    defaultYouPercent: 50,
  },
  {
    id: "standard",
    label: "Standard",
    subtitle: "60% You / 40% Ex",
    defaultYouPercent: 60,
  },
  {
    id: "custom",
    label: "Custom",
    subtitle: "Set manually",
    defaultYouPercent: 50,
  },
] as const;

const MAX_EXPENSE_CENTS = 100_000_000; // $1,000,000.00

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function readFormString(formData: FormData, key: string): string {
  return ((formData.get(key) as string | null) ?? "").trim();
}

function parseCustomPercent(value: string): number | null {
  if (!value.length) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveSplitType(value: string): ExpenseSplitType {
  if (value === "standard" || value === "custom") {
    return value;
  }

  return "equal";
}

function compareIsoDatesAsTime(a: string, b: string): number {
  const timeA = new Date(`${a}T00:00:00.000Z`).getTime();
  const timeB = new Date(`${b}T00:00:00.000Z`).getTime();
  return timeA - timeB;
}

function validateName(name: string): AddExpenseValidation {
  if (name.length < 3) {
    return { valid: false, error: "Expense name must be at least 3 characters." };
  }

  return { valid: true };
}

function validateAmount(amountText: string): AddExpenseValidation {
  const amountCents = amountTextToCents(amountText);
  if (!amountCents) {
    return { valid: false, error: "Enter a valid total amount greater than 0." };
  }

  if (amountCents > MAX_EXPENSE_CENTS) {
    return { valid: false, error: "Amount exceeds the maximum allowed value." };
  }

  return { valid: true };
}

function validateDate(dateIncurred: string, todayIso: string): AddExpenseValidation {
  if (!isIsoDate(dateIncurred)) {
    return { valid: false, error: "Date incurred is required." };
  }

  if (compareIsoDatesAsTime(dateIncurred, todayIso) > 0) {
    return { valid: false, error: "Date incurred cannot be in the future." };
  }

  return { valid: true };
}

function validateCustomSplit(input: AddExpenseInput): AddExpenseValidation {
  if (input.splitType !== "custom") {
    return { valid: true };
  }

  if (input.customYouPercent === null || !Number.isFinite(input.customYouPercent)) {
    return { valid: false, error: "Custom split requires a valid percentage for your share." };
  }

  if (input.customYouPercent <= 0 || input.customYouPercent >= 100) {
    return { valid: false, error: "Custom split must be between 1% and 99% for your share." };
  }

  return { valid: true };
}

function categoryExists(value: string): value is ExpenseCategory {
  return EXPENSE_CATEGORY_OPTIONS.some((option) => option.value === value);
}

export function getTodayIsoDate(referenceDate: Date = new Date()): string {
  const y = referenceDate.getFullYear();
  const m = String(referenceDate.getMonth() + 1).padStart(2, "0");
  const d = String(referenceDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function sanitizeExpenseName(value: string): string {
  return value.trim().split(/\s+/).join(" ");
}

export function amountTextToCents(value: string): number | null {
  const normalized = value.replaceAll(",", "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  const cents = Math.round(parsed * 100);
  return cents > 0 ? cents : null;
}

export function parseExpenseFormData(formData: FormData): AddExpenseInput {
  const rawCategory = readFormString(formData, "category");
  const rawSplit = readFormString(formData, "splitType");
  const customPercentText = readFormString(formData, "customYouPercent");
  const receipt = formData.get("receipt") as File | null;

  const splitType = resolveSplitType(rawSplit);

  const category: ExpenseCategory = categoryExists(rawCategory) ? rawCategory : "medical";

  const customYouPercent = parseCustomPercent(customPercentText);

  return {
    expenseName: sanitizeExpenseName(readFormString(formData, "expenseName")),
    amountText: readFormString(formData, "amount"),
    category,
    dateIncurred: readFormString(formData, "dateIncurred"),
    splitType,
    customYouPercent,
    receiptFileName: receipt && receipt.size > 0 ? receipt.name : undefined,
  };
}

export function validateAddExpenseInput(input: AddExpenseInput, todayIso: string = getTodayIsoDate()): AddExpenseValidation {
  const validators = [
    validateName(input.expenseName),
    validateAmount(input.amountText),
    validateDate(input.dateIncurred, todayIso),
    validateCustomSplit(input),
  ];

  const firstError = validators.find((result) => !result.valid);
  return firstError ?? { valid: true };
}

export function resolveYouPercent(splitType: ExpenseSplitType, customYouPercent: number | null): number {
  if (splitType === "equal") {
    return 50;
  }

  if (splitType === "standard") {
    return 60;
  }

  if (customYouPercent === null || !Number.isFinite(customYouPercent)) {
    return 50;
  }

  return Math.min(99, Math.max(1, Math.round(customYouPercent)));
}

export function computeSplitSummary(
  amountCents: number,
  splitType: ExpenseSplitType,
  customYouPercent: number | null
): SplitSummary {
  const youPercent = resolveYouPercent(splitType, customYouPercent);
  const otherPercent = 100 - youPercent;
  const youShareCents = Math.round((amountCents * youPercent) / 100);
  const otherShareCents = amountCents - youShareCents;

  return {
    youPercent,
    otherPercent,
    youShareCents,
    otherShareCents,
  };
}

export function formatCurrency(cents: number, currency: string = "USD"): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency,
  });
}
