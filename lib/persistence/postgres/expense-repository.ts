/**
 * Expense Repository – PostgreSQL Implementation (Stub)
 *
 * Placeholder for migration 0006_expenses.sql integration.
 * To be implemented when migration is applied to production database.
 */

import type { ExpenseRepository } from "../repositories";
import type { DbExpense } from "../types";

export function createExpenseRepository(): ExpenseRepository {
  return {
    async findById() {
      return null;
    },
    async findByFamilyId() {
      return [];
    },
    async findByFamilyIdAndDateRange() {
      return [];
    },
    async create(data) {
      return data as DbExpense;
    },
    async update(_id, data) {
      return data as DbExpense;
    },
    async delete() {
      return true;
    },
  };
}
