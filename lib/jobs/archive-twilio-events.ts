/**
 * Archive Twilio Webhook Events
 *
 * Cleanup job that moves events older than 90 days from twilio_webhook_events
 * to archive_twilio_webhook_events table. This prevents the main table from
 * growing unbounded while preserving audit trail.
 *
 * Design:
 *   - Finds events older than N days with processing_state != 'processing'
 *   - Atomically inserts into archive, then deletes from main (transaction)
 *   - Skips events currently being processed (prevents data loss)
 *   - Returns count of events archived
 *   - Logs archival completion
 *
 * Usage:
 *   - Can be run manually: await archiveOldTwilioEvents()
 *   - Can be scheduled via job queue
 *   - Should run daily (rate limiting built in via processing_state check)
 */

import { getDb } from "@/lib/persistence";
import { logEvent } from "@/lib/observability/logger";

/**
 * Archive Twilio webhook events older than specified days.
 *
 * @param daysOld - Number of days to consider "old" (default: 90)
 * @param limit - Maximum events to archive in single run (default: 10000)
 * @returns Count of events moved to archive
 */
export async function archiveOldTwilioEvents(
  daysOld: number = 90,
  limit: number = 10000
): Promise<number> {
  try {
    const db = getDb();

    // Call archiveOldEvents on repository
    // This handles the atomic transaction internally
    const count = await db.twilioWebhookEvents.archiveOldEvents(daysOld, limit);

    if (count > 0) {
      logEvent("info", "Twilio webhook events archived successfully", {
        count,
        daysOld,
        operation: "archive_old_twilio_events",
      });
    } else {
      logEvent("info", "No old Twilio webhook events to archive", {
        daysOld,
        operation: "archive_old_twilio_events",
      });
    }

    return count;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    logEvent("error", "Failed to archive old Twilio webhook events", {
      daysOld,
      operation: "archive_old_twilio_events",
      error: message,
    });
    throw error;
  }
}
