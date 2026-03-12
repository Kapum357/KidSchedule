/**
 * KidSchedule – Jobs Module
 *
 * Scheduled and on-demand jobs for maintenance and compliance tasks.
 * Jobs can be triggered:
 * - Manually via API endpoints
 * - On a schedule via cron jobs (Phase 5)
 * - From CLI or admin panel
 *
 * Available Jobs:
 * - purge-deleted-documents: Hard-delete documents soft-deleted 30+ days ago (FERPA compliance)
 */

export { purgeDeletedDocuments, getJobConfig } from "./purge-deleted-documents";
export type { PurgeResult } from "./purge-deleted-documents";
