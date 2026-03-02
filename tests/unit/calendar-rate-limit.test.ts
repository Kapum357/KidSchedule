import {
  checkCalendarRateLimit,
  setCalendarLimit,
  resetCalendarLimits,
  CalendarAction,
} from "@/lib/rate-limit/calendar-limits";

describe("calendar rate limiter", () => {
  beforeEach(() => {
    // restore defaults before each test
    resetCalendarLimits();
  });

  test("allows requests within limit and blocks after", () => {
    const user = "user-123";
    setCalendarLimit("createEvent", { requests: 2, windowMs: 1000 });

    let result = checkCalendarRateLimit(user, "createEvent");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);

    result = checkCalendarRateLimit(user, "createEvent");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);

    result = checkCalendarRateLimit(user, "createEvent");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  test("resets count after window expires", () => {
    const user = "foo";
    setCalendarLimit("createEvent", { requests: 1, windowMs: 10 });

    let r = checkCalendarRateLimit(user, "createEvent");
    expect(r.allowed).toBe(true);

    // fast-forward by monkey-patching Date.now()
    const orig = Date.now;
    Date.now = () => orig() + 20;
    r = checkCalendarRateLimit(user, "createEvent");
    expect(r.allowed).toBe(true);
    Date.now = orig;
  });
});