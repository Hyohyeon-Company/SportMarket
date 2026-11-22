import type { Clock } from "../ports/auth-ports";

/** Production clock: the only adapter that reads the machine time. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/**
 * Test clock. Time is explicit input to the domain — token expiry, session
 * validity and rate-limit windows are all decided from it — so tests advance it
 * instead of sleeping.
 */
export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }

  set(at: Date): void {
    this.current = new Date(at.getTime());
  }
}
