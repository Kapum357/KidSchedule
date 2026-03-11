# Persistence Layer

Type-safe database access for KidSchedule using the **Repository pattern** over PostgreSQL.

---

## Quick start

```ts
import { db } from "@/lib/persistence";

// Single operation
const family = await db.families.findById(familyId);

// Transactional (multi-repo)
import { withTransaction, createPostgresUnitOfWork } from "@/lib/persistence/postgres";
await withTransaction(async (tx) => {
  const uow = createPostgresUnitOfWork(tx);
  const parent = await uow.parents.create(...);
  await uow.auditLogs.create({ userId: parent.id, action: "user.register", ... });
});
```

---

## Directory structure

```
lib/persistence/
├── types.ts          — Db* entity types (storage-focused, ISO-8601 strings)
├── repositories.ts   — Repository interfaces + UnitOfWork contract
├── index.ts          — Singleton db export, initDb(), checkConnection()
├── postgres/
│   ├── client.ts     — postgres.js sql tag, withTransaction()
│   ├── index.ts      — createPostgresUnitOfWork() factory
│   └── *-repository.ts — One file per domain
└── migrations/
    └── *.sql         — Numbered SQL migrations (apply in order)
```

---

## Domain glossary

| UnitOfWork property       | Table(s)                     | Migration(s)         | Notes |
|---------------------------|------------------------------|----------------------|-------|
| `users`                   | `users`                      | 0001                 | |
| `sessions`                | `sessions`                   | 0001                 | |
| `passwordResets`          | `password_reset_requests`    | 0002                 | |
| `phoneVerifications`      | `phone_verifications`        | 0002                 | |
| `auditLogs`               | `audit_logs`                 | 0001                 | |
| `rateLimits`              | `rate_limits`                | 0001                 | |
| `families`                | `families`                   | 0001                 | |
| `parents`                 | `parents`                    | 0003                 | |
| `children`                | `children`                   | 0003                 | |
| `custodySchedules`        | `custody_schedules`          | 0003                 | |
| `calendarEvents`          | `calendar_events`            | 0003                 | |
| `conflictWindows`         | `conflict_windows`           | 0003                 | One row per family (PK = family_id) |
| `scheduleChangeRequests`  | `schedule_change_requests`   | 0003, 0021, 0022     | |
| `changeRequestMessages`   | `change_request_messages`    | 0003                 | |
| `scheduleOverrides`       | `schedule_overrides`         | 0014                 | |
| `holidays`                | `holiday_definitions`        | 0014                 | |
| `holidayExceptionRules`   | `holiday_exception_rules`    | 0016                 | |
| `blogPosts`               | `blog_posts`                 | 0004                 | |
| `blogCategories`          | `blog_categories`            | 0004                 | |
| `schoolEvents`            | `school_events`              | 0005                 | |
| `volunteerTasks`          | `volunteer_tasks`            | 0005                 | |
| `schoolContacts`          | `school_contacts`            | 0005                 | |
| `schoolVaultDocuments`    | `school_vault_documents`     | 0011                 | |
| `lunchMenus`              | `lunch_menus`                | 0005                 | |
| `lunchAccounts`           | `lunch_accounts`             | 0011                 | |
| `lunchTransactions`       | `lunch_transactions`         | 0011                 | |
| `expenses`                | `expenses`                   | 0006                 | |
| `reminders`               | `reminders`                  | 0009                 | |
| `messageThreads`          | `message_threads`            | 0007                 | |
| `messages`                | `messages`                   | 0007                 | |
| `hashChainVerifications`  | `hash_chain_verifications`   | 0007                 | |
| `smsRelayParticipants`    | `sms_relay_participants`     | 0017                 | |
| `moments`                 | `moments`                    | 0008                 | |
| `momentReactions`         | `moment_reactions`           | 0008                 | |
| `scheduledNotifications`  | `scheduled_notifications`    | 0015                 | |
| `exportJobs`              | `export_jobs`                | 0018                 | |
| `exportMetadata`          | `export_metadata`            | 0019                 | |
| `exportMessageHashes`     | `export_message_hashes`      | 0019                 | |
| `exportVerificationAttempts` | `export_verification_attempts` | 0019           | |
| `stripeCustomers`         | `stripe_customers`           | 0020                 | |
| `paymentMethods`          | `payment_methods`            | 0020                 | Soft-delete (is_deleted) |
| `subscriptions`           | `subscriptions`              | 0020                 | |
| `invoices`                | `invoices`                   | 0020                 | Upsert on stripe_invoice_id |
| `planTiers`               | `plan_tiers`                 | 0020                 | Seeded with free/starter/professional |
| `webhookEvents`           | `webhook_events`             | 0020                 | Idempotency via stripe_event_id |
| `mediationTopics`         | `mediation_topics`           | 001_create_mediation | |
| `mediationWarnings`       | `mediation_warnings`         | 001_create_mediation | |

### Billing migration note

`0012_billing.sql` created a minimal billing schema and is **superseded** by `0020_billing.sql`, which drops and recreates all billing tables with the full BILL-001 schema. Both migrations must be run in order (0012 before 0020). `0020` uses `DROP TABLE IF EXISTS … CASCADE` so it is safe regardless of the state left by `0012`.

---

## Adding a new repository

1. **Schema** — add a numbered migration in `migrations/` (increment the highest number).
2. **Type** — add a `Db*` interface in `types.ts`.
3. **Interface** — add a `*Repository` interface in `repositories.ts` and add the property to `UnitOfWork`.
4. **Implementation** — add the factory to the appropriate domain file in `postgres/` (e.g., `blog-repository.ts`, `school-repository.ts`). If no domain file fits, create a new one. Follow the existing patterns:
   - Accept `tx?: SqlClient`; default to the module-level `sql` via `const q: SqlClient = tx ?? sql`.
   - Define a `*Row` type matching the camelCase column names (postgres.js client has a global snake→camelCase transform).
   - Write a `*RowToDb()` converter (dates → `.toISOString()`, nulls → `undefined`).
   - Export a `create*Repository(tx?)` factory.
5. **Wire** — import and add to `createPostgresUnitOfWork()` in `postgres/index.ts`.
6. **Tests** — update any minimal `UnitOfWork` mocks in `tests/unit/` to include the new property.

---

## Naming conventions

- DB entity types: `Db*` prefix (e.g., `DbFamily`)
- Repository interfaces: `*Repository` (e.g., `FamilyRepository`)
- Factory functions: `create*Repository` (e.g., `createFamilyRepository`)
- Tables: `snake_case` plural (e.g., `family_members` → deprecated in favour of `parents`)
- Timestamps: stored as ISO-8601 strings in `Db*` types; PostgreSQL stores `TIMESTAMPTZ`

---

## Transaction support

Use `withTransaction` from `postgres/client.ts` for any operation spanning multiple repositories:

```ts
import { withTransaction, createPostgresUnitOfWork } from "@/lib/persistence/postgres";

await withTransaction(async (tx) => {
  const uow = createPostgresUnitOfWork(tx);
  // All repo calls here share the same transaction
  await uow.families.create(...);
  await uow.parents.create(...);
  await uow.custodySchedules.create(...);
});
```

`UnitOfWork.beginTransaction()` / `.commit()` / `.rollback()` emit warnings when called directly — they exist for interface completeness only. Use `withTransaction` instead.
