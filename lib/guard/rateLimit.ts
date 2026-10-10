// In-memory limits for the public demo. They live in one server instance's memory, so they are
// a basic safeguard, not a guarantee: the real spending cap is the Anthropic account's credit.

const MAX_TRACKED_KEYS = 10_000;

/** Allows `limit` requests per key within a sliding window. */
export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Records a request and returns true if it is within the limit. */
  check(key: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((h) => t - h < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.delete(key); // re-insert so Map order tracks recency
    this.hits.set(key, recent);
    if (this.hits.size > MAX_TRACKED_KEYS) this.hits.delete(this.hits.keys().next().value as string);
    return true;
  }
}

/** App-wide cap on live model calls per UTC day. */
export class DailyCap {
  private day = "";
  private used = 0;
  private readonly limit: number;
  private readonly now: () => number;

  constructor(limit: number, now: () => number = Date.now) {
    this.limit = limit;
    this.now = now;
  }

  private roll() {
    const today = new Date(this.now()).toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.used = 0;
    }
  }

  /** Uses one call if any remain today. */
  tryConsume(): boolean {
    this.roll();
    if (this.used >= this.limit) return false;
    this.used += 1;
    return true;
  }

  /** Gives a call back (e.g. the API was unavailable and nothing was spent). */
  refund(): void {
    this.roll();
    if (this.used > 0) this.used -= 1;
  }
}
