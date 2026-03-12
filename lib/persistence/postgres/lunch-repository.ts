/**
 * KidSchedule – PostgreSQL Lunch Repository
 */

import type {
  LunchMenuRepository,
  LunchAccountRepository,
  LunchTransactionRepository,
} from "../repositories";
import type { DbLunchMenu, DbLunchAccount, DbLunchTransaction } from "../types";
import { sql, type SqlClient } from "./client";

// ─── Lunch Menu impl ──────────────────────────────────────────────────────────

type LunchMenuRow = {
  familyId: string;
  weekStart: Date;
  dayOfWeek: string;
  menuItem: string;
  menuType: string;
  priceCents: number;
};

function menuRowToDb(row: LunchMenuRow): DbLunchMenu {
  return {
    familyId: row.familyId,
    date: row.weekStart.toISOString().split("T")[0],
    mainOption: {
      name: row.menuItem,
      description: `Type: ${row.menuType}`,
    },
    alternativeOption: undefined,
    side: undefined,
    accountBalance: 0,
  };
}

export function createLunchMenuRepository(tx?: SqlClient): LunchMenuRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;

  return {
    async findByFamilyIdSince(familyId: string, fromDate: string): Promise<DbLunchMenu[]> {
      const rows = await q<LunchMenuRow[]>`
        SELECT
          family_id as "familyId",
          week_start as "weekStart",
          day_of_week as "dayOfWeek",
          menu_item as "menuItem",
          menu_type as "menuType",
          price_cents as "priceCents"
        FROM lunch_menus
        WHERE family_id = ${familyId} AND week_start >= ${fromDate}
        ORDER BY week_start ASC, day_of_week ASC
      `;
      return rows.map(menuRowToDb);
    },
  };
}

// ─── Lunch Account impl ───────────────────────────────────────────────────────

type LunchAccountRow = {
  id: string;
  familyId: string;
  childId: string;
  accountNumber: string | null;
  balanceCents: number;
  lastTransactionAt: Date | null;
  autoReloadEnabled: boolean;
  autoReloadThresholdCents: number | null;
  autoReloadAmountCents: number | null;
  createdAt: Date;
};

function accountRowToDb(r: LunchAccountRow): DbLunchAccount {
  return {
    id: r.id,
    familyId: r.familyId,
    childId: r.childId,
    accountNumber: r.accountNumber ?? undefined,
    balanceCents: r.balanceCents,
    lastTransactionAt: r.lastTransactionAt?.toISOString(),
    autoReloadEnabled: r.autoReloadEnabled,
    autoReloadThresholdCents: r.autoReloadThresholdCents ?? undefined,
    autoReloadAmountCents: r.autoReloadAmountCents ?? undefined,
    createdAt: r.createdAt.toISOString(),
  };
}

export function createLunchAccountRepository(tx?: SqlClient): LunchAccountRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;
  return {
    async findById(id) {
      const rows = await q<LunchAccountRow[]>`SELECT * FROM lunch_accounts WHERE id = ${id} LIMIT 1`;
      return rows[0] ? accountRowToDb(rows[0]) : null;
    },
    async findByFamilyId(familyId) {
      const rows = await q<LunchAccountRow[]>`SELECT * FROM lunch_accounts WHERE family_id = ${familyId}`;
      return rows.map(accountRowToDb);
    },
    async findByChildId(childId) {
      const rows = await q<LunchAccountRow[]>`SELECT * FROM lunch_accounts WHERE child_id = ${childId} LIMIT 1`;
      return rows[0] ? accountRowToDb(rows[0]) : null;
    },
    async create(data) {
      const rows = await q<LunchAccountRow[]>`
        INSERT INTO lunch_accounts (family_id, child_id, account_number, balance_cents, auto_reload_enabled, auto_reload_threshold_cents, auto_reload_amount_cents)
        VALUES (${data.familyId}, ${data.childId}, ${data.accountNumber ?? null}, ${data.balanceCents}, ${data.autoReloadEnabled}, ${data.autoReloadThresholdCents ?? null}, ${data.autoReloadAmountCents ?? null})
        RETURNING *
      `;
      return accountRowToDb(rows[0]);
    },
    async updateBalance(id, balanceCents) {
      const rows = await q<LunchAccountRow[]>`
        UPDATE lunch_accounts SET balance_cents = ${balanceCents}, last_transaction_at = NOW()
        WHERE id = ${id} RETURNING *
      `;
      return rows[0] ? accountRowToDb(rows[0]) : null;
    },
  };
}

// ─── Lunch Transaction impl ───────────────────────────────────────────────────

type LunchTransactionRow = {
  id: string;
  accountId: string;
  amountCents: number;
  transactionType: string;
  description: string | null;
  transactionDate: string;
  createdAt: Date;
};

function txRowToDb(r: LunchTransactionRow): DbLunchTransaction {
  return {
    id: r.id,
    accountId: r.accountId,
    amountCents: r.amountCents,
    transactionType: r.transactionType as DbLunchTransaction["transactionType"],
    description: r.description ?? undefined,
    transactionDate: r.transactionDate,
    createdAt: r.createdAt.toISOString(),
  };
}

export function createLunchTransactionRepository(tx?: SqlClient): LunchTransactionRepository {
  // Cast to postgres.Sql for TypeScript generic inference in template literals
  // The union type (Sql | TransactionSql) causes generic type inference to fail
  const q = (tx ?? sql) as typeof sql;
  return {
    async findByAccountId(accountId, limit = 100) {
      const rows = await q<LunchTransactionRow[]>`
        SELECT * FROM lunch_transactions WHERE account_id = ${accountId}
        ORDER BY transaction_date DESC LIMIT ${limit}
      `;
      return rows.map(txRowToDb);
    },
    async create(data) {
      const rows = await q<LunchTransactionRow[]>`
        INSERT INTO lunch_transactions (account_id, amount_cents, transaction_type, description, transaction_date)
        VALUES (${data.accountId}, ${data.amountCents}, ${data.transactionType}, ${data.description ?? null}, ${data.transactionDate})
        RETURNING *
      `;
      return txRowToDb(rows[0]);
    },
  };
}
