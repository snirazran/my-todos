process.env.MONGODB_URI ||= "mongodb://localhost:27017/calendar-health-check";

class GoogleAuthError extends Error {
  constructor(m: string) {
    super(m);
    this.name = "GoogleAuthError";
  }
}
class AppleAuthError extends Error {
  constructor(m: string) {
    super(m);
    this.name = "AppleAuthError";
  }
}

async function main() {
  const cases: [unknown, string][] = [
    [new GoogleAuthError("invalid_grant"), "auth"],
    [new AppleAuthError("invalid Apple ID or app-specific password"), "auth"],
    [new Error("token refresh failed: 400 invalid_grant"), "auth"],
    [new Error("events.list 401: unauthorized"), "auth"],
    [new Error('events.list 403: {"reason":"rateLimitExceeded"}'), "rateLimit"],
    [new Error("429 Too Many Requests"), "rateLimit"],
    [new Error("calendars.get 404: Not Found"), "gone"],
    [new Error("events.insert 410: resource is gone"), "gone"],
    [new Error("fetch failed"), "transient"],
    [new Error("google scheduled sync timed out after 90000ms"), "transient"],
    [new Error("socket hang up"), "transient"],
    [new Error("events.list 503: backendError"), "transient"],
    [
      Object.assign(new Error("connect ETIMEDOUT"), { code: "ETIMEDOUT" }),
      "transient",
    ],
  ];

  const { classifySyncError } = await import("../src/lib/calendar/health");

  let failed = 0;
  for (const [err, expected] of cases) {
    const { kind } = classifySyncError(err);
    const ok = kind === expected;
    if (!ok) failed++;
    console.log(
      `${ok ? "ok  " : "FAIL"} ${expected.padEnd(9)} got=${kind.padEnd(9)} ${(err as Error).message}`,
    );
  }
  console.log(
    failed === 0 ? "\nall classifications correct" : `\n${failed} mismatch(es)`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

void main();
