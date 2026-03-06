/**
 * Export Queue Metrics Endpoint
 *
 * Provides observability into queue health and performance
 * GET /api/exports/metrics - Returns queue statistics
 */

import { getDb } from "@/lib/persistence";
import { getQueueLength } from "@/lib/export-queue";
import { getWorkerMetrics } from "@/lib/export-worker";

/**
 * Queue Metrics Response
 *
 * Response:
 *   {
 *     queueLength: number,
 *     workerStatus: { isRunning, processedCount, failedCount },
 *     jobStats: { total, queued, processing, complete, failed },
 *     averageProcessingTime: number (ms),
 *     successRate: number (0-1)
 *   }
 */
export async function GET() {
  try {
    // Get queue length
    const queueLength = await getQueueLength();

    // Get worker metrics
    const workerMetrics = getWorkerMetrics();

    // Get job statistics from database
    const db = getDb();
    const allJobs = await Promise.all([
      db.exportJobs?.findByStatus("queued").then((jobs) => jobs?.length ?? 0) ?? 0,
      db.exportJobs?.findByStatus("processing").then((jobs) => jobs?.length ?? 0) ?? 0,
      db.exportJobs?.findByStatus("complete").then((jobs) => jobs?.length ?? 0) ?? 0,
      db.exportJobs?.findByStatus("failed").then((jobs) => jobs?.length ?? 0) ?? 0,
    ]);

    const [queuedCount, processingCount, completeCount, failedCount] = allJobs;
    const totalCount = queuedCount + processingCount + completeCount + failedCount;

    // Calculate success rate
    const successfulJobs = completeCount;
    const totalCompleted = completeCount + failedCount;
    const successRate = totalCompleted > 0 ? successfulJobs / totalCompleted : 1;

    // Calculate average processing time (rough estimate from worker metrics)
    // In a real system, this would be tracked in the database
    const averageProcessingTime = workerMetrics.processedCount > 0
      ? 30000 // Placeholder: 30 seconds average (would be calculated from actual job data)
      : 0;

    const metrics = {
      timestamp: new Date().toISOString(),
      queueLength,
      workerStatus: {
        isRunning: workerMetrics.isRunning,
        processedCount: workerMetrics.processedCount,
        failedCount: workerMetrics.failedCount,
      },
      jobStats: {
        total: totalCount,
        queued: queuedCount,
        processing: processingCount,
        complete: completeCount,
        failed: failedCount,
      },
      averageProcessingTime,
      successRate: Math.round(successRate * 10000) / 10000, // Round to 4 decimal places
      health: {
        isHealthy: queueLength < 1000 && successRate > 0.9,
        warnings: [] as string[],
      },
    };

    // Add health warnings
    if (queueLength > 500) {
      metrics.health.warnings.push("High queue length detected");
    }
    if (successRate < 0.9) {
      metrics.health.warnings.push("Low success rate");
    }
    if (processingCount > 10) {
      metrics.health.warnings.push("Many jobs processing simultaneously");
    }
    if (!workerMetrics.isRunning) {
      metrics.health.warnings.push("Worker process not running");
    }

    return Response.json(metrics);
  } catch (error) {
    console.error("[Metrics] Failed to collect metrics:", error);
    return Response.json(
      { error: "server_error", message: "Failed to collect metrics" },
      { status: 500 }
    );
  }
}
