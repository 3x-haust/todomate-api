type Bucket = {
  readonly count: number;
  readonly resetAt: number;
};

type FixedWindowRateLimitOptions = {
  readonly limit: number;
  readonly now?: () => number;
  readonly windowMs: number;
};

export class FixedWindowRateLimit {
  private readonly buckets = new Map<string, Bucket>();
  private readonly limit: number;
  private readonly now: () => number;
  private readonly windowMs: number;

  constructor(options: FixedWindowRateLimitOptions) {
    this.limit = options.limit;
    this.now = options.now ?? Date.now;
    this.windowMs = options.windowMs;
  }

  consume(key: string): boolean {
    const now = this.now();
    const current = this.buckets.get(key);
    if (current === undefined || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (current.count >= this.limit) {
      return false;
    }
    this.buckets.set(key, { count: current.count + 1, resetAt: current.resetAt });
    return true;
  }
}
