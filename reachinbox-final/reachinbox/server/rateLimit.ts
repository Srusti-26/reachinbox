import type IORedis from 'ioredis';

export const HOUR_MS = 3_600_000;

/** Hour window index from epoch. Timezone-independent (the old code mixed UTC keys with local-time boundaries). */
export const hourWindow = (now = Date.now()) => Math.floor(now / HOUR_MS);

/** First millisecond of the next hour window. */
export const nextWindowStart = (now = Date.now()) => (hourWindow(now) + 1) * HOUR_MS;

// Atomic "check, then increment". A plain INCR-then-DECR lets concurrent workers briefly
// overshoot the cap; one Lua script evaluates and mutates in a single Redis step.
const CONSUME_LUA = `
local c = tonumber(redis.call('GET', KEYS[1]) or '0')
if c >= tonumber(ARGV[1]) then return 0 end
redis.call('INCR', KEYS[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`;

export const rateKey = (senderEmail: string, now = Date.now()) => `rl:${senderEmail}:${hourWindow(now)}`;

export async function tryConsume(redis: IORedis, senderEmail: string, limit: number, now = Date.now()): Promise<boolean> {
  const ok = await redis.eval(CONSUME_LUA, 1, rateKey(senderEmail, now), limit, HOUR_MS * 2);
  return ok === 1;
}

/** Hand a slot back, e.g. when the SMTP send failed after we reserved it. */
export async function releaseSlot(redis: IORedis, senderEmail: string, now = Date.now()): Promise<void> {
  const key = rateKey(senderEmail, now);
  const v = await redis.decr(key);
  if (v < 0) await redis.set(key, 0, 'PX', HOUR_MS * 2);
}

/**
 * True exactly once per (user, sender, hour window) across ALL workers/instances.
 * Replaces the old in-process Set, which would alert once per process.
 */
export async function claimRateLimitAlert(redis: IORedis, userId: string, senderEmail: string, now = Date.now()): Promise<boolean> {
  const res = await redis.set(`rl:alert:${userId}:${senderEmail}:${hourWindow(now)}`, '1', 'PX', HOUR_MS * 2, 'NX');
  return res === 'OK';
}

/**
 * When a sender's cap is hit, the job moves to just after the next window starts (not dropped, not failed).
 * The email's original offset within its hour, compressed to at most ~3.6s, is added so earlier emails
 * stay ahead of later ones instead of all landing on the same millisecond.
 */
export function rescheduleTime(originalScheduledAtMs: number, now = Date.now()): number {
  const orderOffset = Math.floor((originalScheduledAtMs % HOUR_MS) / 1000);
  return nextWindowStart(now) + 1000 + orderOffset;
}
