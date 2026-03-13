/**
 * KidSchedule – PostgreSQL Expense Repository
 *
 * Implements expense CRUD operations with family-scoped queries.
 * Supports filtering by date range for reporting and analysis.
 */

import type { ExpenseRepository } from "../repositories";
import type { DbExpense } from "../types";
import { sql, type SqlClient } from "./client";

type ExpenseRow = {
  id: string;
  familyId: string;
  title: string;
  description: string | null;
  category: string;
  totalAmount: number;
  currency: string;
  splitMethod: string;
  splitRatio: Record<string, number> | null;
  paidBy: string;
  paymentStatus: string;
  receiptUrl: string | null;
  date: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
};

function toIsoDate(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value;
}

function toIsoDateTime(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function rowToDb(row: ExpenseRow): DbExpense {
  let totalAmountNum = row.totalAmount;
  if (typeof row.totalAmount === "string") {
    totalAmountNum = parseInt(row.totalAmount, 10);
  }

  let normalizedSplitRatio: Record<string, number> | undefined;
  if (row.splitRatio) {
    normalizedSplitRatio = {};
    for (const [key, value] of Object.entries(row.splitRatio)) {
      normalizedSplitRatio[key] = typeof value === "string" ? parseFloat(value) : value;
    }
  }

  return {
    id: row.id,
    familyId: row.familyId,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category as DbExpense["category"],
    totalAmount: totalAmountNum,
    currency: row.currency,
    splitMethod: row.splitMethod as DbExpense["splitMethod"],
    splitRatio: normalizedSplitRatio,
    paidBy: row.paidBy,
    paymentStatus: row.paymentStatus as DbExpense["paymentStatus"],
    receiptUrl: row.receiptUrl ?? undefined,
    date: toIsoDate(row.date),
    createdAt: toIsoDateTime(row.createdAt),
    updatedAt: toIsoDateTime(row.updatedAt),
  };
}

export function createExpenseRepository(tx?: SqlClient): ExpenseRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const query = (tx ?? sql) as typeof sql;

  return {
    async findById(id: string): Promise<DbExpense | null> {
      const rows = await query<ExpenseRow[]>`
        SELECT * FROM expenses WHERE id = ${id}
      `;
      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async findByFamilyId(familyId: string): Promise<DbExpense[]> {
      const rows = await query<ExpenseRow[]>`
        SELECT * FROM expenses
        WHERE family_id = ${familyId}
        ORDER BY date DESC, created_at DESC
      `;
      return rows.map(rowToDb);
    },

    async findByFamilyIdAndDateRange(
      familyId: string,
      startDate: string,
      endDate: string
    ): Promise<DbExpense[]> {
      const rows = await query<ExpenseRow[]>`
        SELECT * FROM expenses
        WHERE family_id = ${familyId}
          AND date >= ${startDate}
          AND date <= ${endDate}
        ORDER BY date DESC, created_at DESC
      `;
      return rows.map(rowToDb);
    },

    async create(
      expense: Omit<DbExpense, "id" | "createdAt" | "updatedAt">
    ): Promise<DbExpense> {
      const now = new Date().toISOString();
      const rows = await query<ExpenseRow[]>`
        INSERT INTO expenses (
          family_id,
          title,
          description,
          category,
          total_amount,
          currency,
          split_method,
          split_ratio,
          paid_by,
          payment_status,
          receipt_url,
          date,
          created_at,
          updated_at
        )
        VALUES (
          ${expense.familyId},
          ${expense.title},
          ${expense.description ?? null},
          ${expense.category},
          ${expense.totalAmount},
          ${expense.currency},
          ${expense.splitMethod},
          ${expense.splitRatio ? JSON.stringify(expense.splitRatio) : null},
          ${expense.paidBy},
          ${expense.paymentStatus},
          ${expense.receiptUrl ?? null},
          ${expense.date},
          ${now},
          ${now}
        )
        RETURNING *
      `;
      return rowToDb(rows[0]);
    },

    async update(
      id: string,
      data: Partial<DbExpense>
    ): Promise<DbExpense | null> {
      const now = new Date().toISOString();

      // Build dynamic update clause
      const updates: string[] = [];
      const values: unknown[] = [];

      if (data.title !== undefined) {
        updates.push("title");
        values.push(data.title);
      }
      if (data.description !== undefined) {
        updates.push("description");
        values.push(data.description ?? null);
      }
      if (data.category !== undefined) {
        updates.push("category");
        values.push(data.category);
      }
      if (data.totalAmount !== undefined) {
        updates.push("total_amount");
        values.push(data.totalAmount);
      }
      if (data.currency !== undefined) {
        updates.push("currency");
        values.push(data.currency);
      }
      if (data.splitMethod !== undefined) {
        updates.push("split_method");
        values.push(data.splitMethod);
      }
      if (data.splitRatio !== undefined) {
        updates.push("split_ratio");
        values.push(data.splitRatio ? JSON.stringify(data.splitRatio) : null);
      }
      if (data.paymentStatus !== undefined) {
        updates.push("payment_status");
        values.push(data.paymentStatus);
      }
      if (data.receiptUrl !== undefined) {
        updates.push("receipt_url");
        values.push(data.receiptUrl ?? null);
      }
      if (data.date !== undefined) {
        updates.push("date");
        values.push(data.date);
      }

      updates.push("updated_at");
      values.push(now);

      if (updates.length === 1) {
        // Only updated_at changed, or nothing to update
        return this.findById(id);
      }

      // Build SET clause dynamically
      const setClause = updates
        .map((col, i) => `${col} = $${i + 1}`)
        .join(", ");

      const rows = await query<ExpenseRow[]>`
        UPDATE expenses
        SET ${setClause}
        WHERE id = ${id}
        RETURNING *
      `;

      return rows[0] ? rowToDb(rows[0]) : null;
    },

    async delete(id: string): Promise<boolean> {
      // Note: postgres.js doesn't return rowCount directly on DELETE
      // We check if a row was found and deleted by querying first
      const existing = await this.findById(id);
      if (!existing) {
        return false;
      }
      await query`DELETE FROM expenses WHERE id = ${id}`;
      return true;
    },
  };
}
