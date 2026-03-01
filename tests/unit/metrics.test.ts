import { getMetricCount, getMetricAverage, observeDuration, incrementCounter, _test_resetMetrics } from "@/lib/observability/metrics";

describe("metrics store", () => {
  beforeEach(() => {
    // clear any points left over from previous tests
    _test_resetMetrics();
    jest.useFakeTimers({ now: 0, doNotFake: ["nextTick", "setImmediate"] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("counts increments and respects tags", () => {
    // add two increments without tags
    incrementCounter("error.count");
    incrementCounter("error.count", 2);

    expect(getMetricCount("error.count", 1000)).toBe(3);

    // with tags
    incrementCounter("error.count", 1, { source: "api" });
    expect(getMetricCount("error.count", 1000, { source: "api" })).toBe(1);
    expect(getMetricCount("error.count", 1000, { source: "other" })).toBe(0);
  });

  it("averages duration metrics correctly", () => {
    observeDuration("db.query.duration", 100);
    observeDuration("db.query.duration", 300);
    expect(getMetricAverage("db.query.duration", 1000)).toBe(200);

    // tags are respected
    observeDuration("db.query.duration", 50, { table: "users" });
    expect(getMetricAverage("db.query.duration", 1000, { table: "users" })).toBe(50);
  });

  it("honors the sliding time window when selecting points", () => {
    // initial time 0
    incrementCounter("error.count"); // t=0
    jest.advanceTimersByTime(500);
    incrementCounter("error.count"); // t=500

    // query with window 400ms -> only second point should count
    expect(getMetricCount("error.count", 400)).toBe(1);
    // window 600ms -> both
    expect(getMetricCount("error.count", 600)).toBe(2);
  });

  it("prunes old points according to retention period", () => {
    const retentionMs = 24 * 60 * 60 * 1000;
    incrementCounter("error.count"); // t=0

    // advance past retention
    jest.advanceTimersByTime(retentionMs + 1);
    // calling any selector will prune internally
    expect(getMetricCount("error.count", 1000)).toBe(0);
  });
});
