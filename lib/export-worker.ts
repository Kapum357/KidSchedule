/**
 * Export Worker
 *
 * Long-running process that dequeues export jobs and processes them.
 * Designed to run as a separate Node process, managed by PM2 or similar.
 */

import { getDb } from "@/lib/persistence";
import { dequeueExport, getQueueLength } from "./export";
import type { ExportJobStatus, ExportJobRecord } from "@/lib";

// Worker configuration
const WORKER_POLL_INTERVAL_MS = 1000; // Check queue every 1 second
const MAX_RETRIES = 3; // Retry failed jobs up to 3 times
const RETRY_BACKOFF_MS = 5000; // Wait 5 seconds before retrying

/**
 * Start the worker process
 *
 * Continuously polls the queue and processes jobs until stop() is called.
 * Handles graceful shutdown on SIGTERM/SIGINT.
 */
export async function startWorker(): Promise<void> {
  console.log("[Worker] Starting export queue worker...");
  setWorkerRunning(true);

  // Handle graceful shutdown
  process.on("SIGTERM", async () => {
    console.log("[Worker] SIGTERM received, shutting down gracefully...");
    await stopWorker();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("[Worker] SIGINT received, shutting down gracefully...");
    await stopWorker();
    process.exit(0);
  });

  // Main worker loop
  while (getWorkerState().isRunning) {
    try {
      const jobId = await dequeueExport();

      if (!jobId) {
        // No jobs available, wait before checking again
        await sleep(WORKER_POLL_INTERVAL_MS);
        continue;
      }

      // Process the job
      const db = getDb();

      try {
        // 1. Fetch job record
        const job = await db.exportJobs?.findById(jobId);
        if (!job) {
          console.warn(`[Worker] Job not found: ${jobId}`);
          continue;
        }

        console.log(`[Worker] Processing job ${jobId} (${job.type})...`);

        // 2. Update status to processing
        await updateJobStatus(jobId, "processing");

        // 3. Generate export (dynamic import to avoid bundling pdfkit in API routes)
        const { generateExport } = await import("./export");
        const result = await generateExport(job);

        // 4. Update job with result
        await db.exportJobs?.update(jobId, {
          status: "complete" as ExportJobStatus,
          resultUrl: result.resultUrl,
          mimeType: result.mimeType,
          sizeBytes: result.sizeBytes,
          completedAt: new Date().toISOString(),
        });

        console.log(`[Worker] Job completed: ${jobId}`);
        incrementProcessed();
      } catch (error) {
        await handleJobFailure(jobId, error);
      }
    } catch (error) {
      console.error("[Worker] Unexpected error in worker loop:", error);
      // Continue running despite errors
      await sleep(WORKER_POLL_INTERVAL_MS);
    }

    // Log metrics periodically
    const { processedCount: processed, failedCount: failed } = getWorkerState();
    const queueLength = await getQueueLength();
    console.log(
      `[Worker] Stats - Processed: ${processed}, Failed: ${failed}, Queue: ${queueLength}`,
    );
  }

  console.log("[Worker] Export queue worker stopped");
}

/**
 * Stop the worker process
 */
export async function stopWorker(): Promise<void> {
  setWorkerRunning(false);
  console.log("[Worker] Stopping worker gracefully...");
}

/**
 * Handle job failure with retry logic
 */
async function handleJobFailure(jobId: string, error: unknown): Promise<void> {
  const db = getDb();
  const errorMessage = error instanceof Error ? error.message : String(error);

  console.error(`[Worker] Job failed: ${jobId} - ${errorMessage}`);

  try {
    // Fetch current retry count
    const job = await db.exportJobs?.findById(jobId);
    if (!job) {
      console.warn(`[Worker] Job not found for retry: ${jobId}`);
      return;
    }

    // Decide whether to retry or mark as failed
    if (job.retryCount < MAX_RETRIES) {
      // Retry: update retry count and requeue
      const newRetryCount = job.retryCount + 1;
      await db.exportJobs?.update(jobId, {
        retryCount: newRetryCount,
      });

      console.log(`[Worker] Requeuing job (attempt ${newRetryCount}): ${jobId}`);

      // Wait before retrying
      await sleep(RETRY_BACKOFF_MS);

      // Requeue by enqueuing again
      const { enqueueExport } = await import("./export");
      await enqueueExport(jobId);
    } else {
      // No more retries: mark as failed
      await updateJobStatus(jobId, "failed", errorMessage);
      console.log(`[Worker] Job failed permanently: ${jobId}`);
      incrementFailed();
    }
  } catch (updateError) {
    console.error(`[Worker] Failed to handle job failure for ${jobId}:`, updateError);
  }
}

/**
 * Update job status
 */
async function updateJobStatus(
  jobId: string,
  status: ExportJobStatus,
  errorMessage?: string
): Promise<void> {
  const db = getDb();

  const updates: Partial<ExportJobRecord> = {
    status,
  };

  if (errorMessage) {
    updates.error = errorMessage;
  }

  await db.exportJobs?.update(jobId, updates);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Re-export metrics from the lightweight state module so external
// callers can import metrics without pulling in heavyweight deps.
// Export the local getWorkerState (not from ./export which doesn't
// export this symbol).
export { getWorkerState as getWorkerMetrics };

/**
 * Export Worker State
 *
 * Lightweight module that holds shared worker process state.
 * Intentionally separated from export-worker.ts so the metrics API
 * endpoint can read state without importing pdfkit transitively.
 */

let isRunning = false;
let processedCount = 0;
let failedCount = 0;

export function getWorkerState() {
  return { isRunning, processedCount, failedCount };
}

export function setWorkerRunning(value: boolean) {
  isRunning = value;
}

export function incrementProcessed() {
  processedCount++;
}

export function incrementFailed() {
  failedCount++;
}
