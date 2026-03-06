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
