/**
 * KidSchedule – Lightweight in-process metrics
 *
 * Tracks latency and counters for operational observability:
 * - db.query.duration
 * - api.request.duration
 * - error.count
 */

export type MetricName = "db.query.duration" | "api.request.duration" | "error.count";

export type MetricTags = Readonly<Record<string, string>>;

interface MetricPoint {
  name: MetricName;
  value: number;
  timestamp: number;
  tags?: MetricTags;
}

const RETENTION_MS = 24 * 60 * 60 * 1000;
const points: MetricPoint[] = [];

function prune(now = Date.now()): void {
  const cutoff = now - RETENTION_MS;
  while (points.length > 0 && points[0].timestamp < cutoff) {
    points.shift();
  }
}

function matchesTags(pointTags: MetricTags | undefined, filterTags?: MetricTags): boolean {
  if (!filterTags) return true;
  if (!pointTags) return false;

  for (const [key, expected] of Object.entries(filterTags)) {
    if (pointTags[key] !== expected) return false;
  }

  return true;
}

function selectPoints(name: MetricName, windowMs: number, tags?: MetricTags): MetricPoint[] {
  const now = Date.now();
  prune(now);
  const cutoff = now - windowMs;

  return points.filter(
    (point) =>
      point.name === name && point.timestamp >= cutoff && matchesTags(point.tags, tags)
  );
}

function pushMetricPoint(name: MetricName, value: number, tags?: MetricTags): void {
  points.push({
    name,
    value,
    timestamp: Date.now(),
    tags,
  });
}

export function observeDuration(
  name: "db.query.duration" | "api.request.duration",
  valueMs: number,
  tags?: MetricTags
): void {
  if (!Number.isFinite(valueMs) || valueMs < 0) return;
  pushMetricPoint(name, valueMs, tags);
}

export function incrementCounter(
  name: "error.count",
  delta = 1,
  tags?: MetricTags
): void {
  if (!Number.isFinite(delta) || delta <= 0) return;
  pushMetricPoint(name, delta, tags);
}

export function getMetricCount(name: MetricName, windowMs: number, tags?: MetricTags): number {
  const selected = selectPoints(name, windowMs, tags);
  return selected.reduce((sum, point) => sum + point.value, 0);
}

export function getMetricAverage(
  name: "db.query.duration" | "api.request.duration",
  windowMs: number,
  tags?: MetricTags
): number {
  const selected = selectPoints(name, windowMs, tags);
  if (selected.length === 0) return 0;

  const total = selected.reduce((sum, point) => sum + point.value, 0);
  return total / selected.length;
}
