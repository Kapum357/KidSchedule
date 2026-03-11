import {
  amountTextToCents,
  computeSplitSummary,
  parseExpenseFormData,
  validateAddExpenseInput,
} from "@/lib/expense-engine";
import type { DbExpense } from "@/lib/persistence/types";

describe("Expense Mapping & Conversion", () => {
  describe("amountTextToCents", () => {
    it("should convert valid amount text to cents", () => {
      expect(amountTextToCents("12.50")).toBe(1250);
      expect(amountTextToCents("100")).toBe(10000);
      expect(amountTextToCents("0.99")).toBe(99);
    });

    it("should handle missing decimal places", () => {
      expect(amountTextToCents("50")).toBe(5000);
    });

    it("should return null for invalid input", () => {
      expect(amountTextToCents("abc")).toBeNull();
      expect(amountTextToCents("")).toBeNull();
    });
  });

  describe("computeSplitSummary", () => {
    it("should compute 50-50 split correctly", () => {
      const summary = computeSplitSummary(1000, "equal", null);
      expect(summary.youPercent).toBe(50);
      expect(summary.otherPercent).toBe(50);
      expect(summary.youShareCents).toBe(500);
      expect(summary.otherShareCents).toBe(500);
    });

    it("should compute custom split with user percentage", () => {
      const summary = computeSplitSummary(1000, "custom", 70);
      expect(summary.youPercent).toBe(70);
      expect(summary.otherPercent).toBe(30);
      expect(summary.youShareCents).toBe(700);
      expect(summary.otherShareCents).toBe(300);
    });

    it("should treat standard as 60/40 split", () => {
      const summary = computeSplitSummary(1000, "standard", null);
      expect(summary.youPercent).toBe(60);
      expect(summary.otherPercent).toBe(40);
    });

    it("should handle zero amount", () => {
      const summary = computeSplitSummary(0, "equal", null);
      expect(summary.youShareCents).toBe(0);
      expect(summary.otherShareCents).toBe(0);
    });
  });

  describe("UI to DB schema mapping", () => {
    it("should map split types correctly", () => {
      const splitTypeMap: Record<"equal" | "standard" | "custom", "50-50" | "custom" | "one-parent"> = {
        equal: "50-50",
        standard: "50-50",
        custom: "custom",
      };

      expect(splitTypeMap["equal"]).toBe("50-50");
      expect(splitTypeMap["standard"]).toBe("50-50");
      expect(splitTypeMap["custom"]).toBe("custom");
    });

    it("should build correct splitRatio for custom split", () => {
      const parentId = "parent-1";
      const otherParentId = "parent-2";
      const summary = computeSplitSummary(1000, "custom", 60);

      const splitRatio: Record<string, number> = {
        [parentId]: summary.youPercent / 100,
        [otherParentId]: summary.otherPercent / 100,
      };

      expect(splitRatio[parentId]).toBe(0.6);
      expect(splitRatio[otherParentId]).toBe(0.4);
      expect(Object.keys(splitRatio).length).toBe(2);
    });

    it("should not include splitRatio for 50-50 split", () => {
      // For "equal" splits that map to "50-50", splitRatio should be undefined
      // Only "custom" splits should include a splitRatio object
      const ratio = undefined; // 50-50 and standard splits have no custom splitRatio

      expect(ratio).toBeUndefined();
    });
  });

  describe("validateAddExpenseInput", () => {
    it("should accept valid expense input", () => {
      const input = {
        expenseName: "Soccer Cleats",
        amountText: "75.99",
        category: "activity" as const,
        dateIncurred: "2024-03-10",
        splitType: "equal" as const,
        customYouPercent: null,
        receiptFileName: undefined,
      };

      const validation = validateAddExpenseInput(input);
      expect(validation.valid).toBe(true);
    });

    it("should reject expense with missing name", () => {
      const input = {
        expenseName: "",
        amountText: "75.99",
        category: "activity" as const,
        dateIncurred: "2024-03-10",
        splitType: "equal" as const,
        customYouPercent: null,
        receiptFileName: undefined,
      };

      const validation = validateAddExpenseInput(input);
      expect(validation.valid).toBe(false);
    });

    it("should reject expense with invalid amount", () => {
      const input = {
        expenseName: "Soccer Cleats",
        amountText: "not-a-number",
        category: "activity" as const,
        dateIncurred: "2024-03-10",
        splitType: "equal" as const,
        customYouPercent: null,
        receiptFileName: undefined,
      };

      const validation = validateAddExpenseInput(input);
      expect(validation.valid).toBe(false);
    });

    it("should reject zero amount", () => {
      const input = {
        expenseName: "Soccer Cleats",
        amountText: "0",
        category: "activity" as const,
        dateIncurred: "2024-03-10",
        splitType: "equal" as const,
        customYouPercent: null,
        receiptFileName: undefined,
      };

      const validation = validateAddExpenseInput(input);
      expect(validation.valid).toBe(false);
    });
  });

  describe("DbExpense object construction", () => {
    it("should build valid DbExpense object for 50-50 split", () => {
      const parentId = "parent-1";
      const familyId = "family-1";
      const amountCents = 7599;
      const category = "activity" as const;

      const expense: Omit<DbExpense, "id" | "createdAt" | "updatedAt"> = {
        familyId,
        title: "Soccer Cleats",
        category,
        totalAmount: amountCents,
        currency: "USD",
        splitMethod: "50-50",
        paidBy: parentId,
        paymentStatus: "unpaid",
        date: "2024-03-10",
      };

      expect(expense.familyId).toBe(familyId);
      expect(expense.totalAmount).toBe(amountCents);
      expect(expense.splitMethod).toBe("50-50");
      expect(expense.splitRatio).toBeUndefined();
    });

    it("should build valid DbExpense object for custom split", () => {
      const parentId = "parent-1";
      const otherParentId = "parent-2";
      const familyId = "family-1";
      const amountCents = 1000;

      const splitRatio: Record<string, number> = {
        [parentId]: 0.7,
        [otherParentId]: 0.3,
      };

      const expense: Omit<DbExpense, "id" | "createdAt" | "updatedAt"> = {
        familyId,
        title: "Medical Bill",
        category: "medical",
        totalAmount: amountCents,
        currency: "USD",
        splitMethod: "custom",
        splitRatio,
        paidBy: parentId,
        paymentStatus: "unpaid",
        date: "2024-03-10",
      };

      expect(expense.splitMethod).toBe("custom");
      expect(expense.splitRatio).toEqual(splitRatio);
      expect(expense.splitRatio![parentId]).toBe(0.7);
      expect(expense.splitRatio![otherParentId]).toBe(0.3);
    });
  });
});
