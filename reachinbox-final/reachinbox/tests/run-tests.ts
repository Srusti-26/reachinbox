/**
 * Integration tests. Need a real Redis:  REDIS_URL=redis://localhost:6379 npx tsx --test tests/run-tests.ts
 * These exercise server/rateLimit.ts and the BullMQ behaviours the worker depends on.
 * (DB / SMTP / Slack / Elasticsearch are covered by the manual demo script in the README.)
 */
import assert from 'node:assert';
import { test, after } from 'node:test';
import IORedis from 'ioredis';
import { Queue, Worker, DelayedError, QueueEvents } from 'bullmq';
import { tryConsume, releaseSlot, claimRateLimitAlert, hourWindow, nextWindowStart, rescheduleTime, HOUR_MS } from '../server/rateLimit.js';

const url = process.env.REDIS_URL || 'redis://localhost:6379';
const mk = () => new IORedis(url, { maxRetriesPerRequest: null });
const redis = mk();
const uniq = () => `t${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cleanup: Array<() => Promise<unknown>> = [];
after(async () => { for (const c of cleanup) await c().catch(() => {}); await redis.quit(); });

test('hour window math is timezone-independent and lands exactly on the hour', () => {
  // 02:30 UTC == 08:00 IST. The old code used LOCAL hours for the boundary but UTC for the key.
  const t = Date.UTC(2026, 9, 17, 2, 30, 0);
  assert.strictEqual(nextWindowStart(t), Date.UTC(2026, 9, 17, 3, 0, 0));
  assert.strictEqual(hourWindow(nextWindowStart(t)), hourWindow(t) + 1);
  assert.strictEqual(nextWindowStart(t) % HOUR_MS, 0);
});

test('reschedule lands in the NEXT window and keeps relative order', () => {
  const now = Date.UTC(2026, 9, 17, 2, 59, 59);
  const a = rescheduleTime(Date.UTC(2026, 9, 17, 2, 10, 0), now);
  const b = rescheduleTime(Date.UTC(2026, 9, 17, 2, 40, 0), now);
  assert.ok(hourWindow(a) === hourWindow(now) + 1 && hourWindow(b) === hourWindow(now) + 1);
  assert.ok(a < b, 'earlier email must be re-sent before later one');
  assert.ok(a - nextWindowStart(now) < 5000, 'must not smear a backlog across the hour');
});

test('Lua limiter: 60 concurrent attempts against a cap of 10 allow EXACTLY 10', async () => {
  const sender = `${uniq()}@x.test`;
  const results = await Promise.all(Array.from({ length: 60 }, () => tryConsume(redis, sender, 10)));
  assert.strictEqual(results.filter(Boolean).length, 10);
});

test('limiter is shared across separate connections (i.e. across worker instances)', async () => {
  const sender = `${uniq()}@x.test`;
  const conns = [mk(), mk(), mk()];
  cleanup.push(async () => { await Promise.all(conns.map((c) => c.quit())); });
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) => tryConsume(conns[i % 3], sender, 7)));
  assert.strictEqual(results.filter(Boolean).length, 7);
});

test('releaseSlot gives quota back and never goes negative', async () => {
  const sender = `${uniq()}@x.test`;
  assert.ok(await tryConsume(redis, sender, 1));
  assert.ok(!(await tryConsume(redis, sender, 1)));
  await releaseSlot(redis, sender);
  assert.ok(await tryConsume(redis, sender, 1));
  await releaseSlot(redis, sender); await releaseSlot(redis, sender); await releaseSlot(redis, sender);
  assert.ok(await tryConsume(redis, sender, 1)); // would be false if the counter had gone negative-then-wrong
});

test('rate-limit Slack alert is claimed once per user+sender+window across workers', async () => {
  const user = uniq(), sender = 's@x.test';
  const claims = await Promise.all(Array.from({ length: 20 }, () => claimRateLimitAlert(redis, user, sender)));
  assert.strictEqual(claims.filter(Boolean).length, 1);
  assert.ok(await claimRateLimitAlert(redis, user, 'other@x.test'), 'different sender gets its own alert');
});

test('BullMQ: adding the same jobId twice creates ONE job (idempotent enqueue)', async () => {
  const q = new Queue(uniq(), { connection: mk() });
  cleanup.push(() => q.obliterate({ force: true }).then(() => q.close()));
  await q.add('send', { n: 1 }, { jobId: 'eml_1', delay: 60_000 });
  await q.add('send', { n: 2 }, { jobId: 'eml_1', delay: 60_000 });
  assert.strictEqual(await q.getDelayedCount(), 1);
});

test('BullMQ: DelayedError moves the SAME job to a later time without failing it or burning an attempt', async () => {
  const name = uniq();
  const q = new Queue(name, { connection: mk() });
  const events = new QueueEvents(name, { connection: mk() });
  let runs = 0;
  const w = new Worker(name, async (job, token) => {
    runs++;
    if (runs === 1) { await job.moveToDelayed(Date.now() + 400, token); throw new DelayedError(); }
    return 'ok';
  }, { connection: mk() });
  cleanup.push(async () => { await w.close(); await events.close(); await q.obliterate({ force: true }); await q.close(); });

  const job = await q.add('send', {}, { jobId: 'eml_rl', attempts: 3 });
  await job.waitUntilFinished(events, 5000);
  assert.strictEqual(runs, 2);
  const j = await q.getJob('eml_rl');
  assert.strictEqual(j?.attemptsMade, 1, 'only the successful run counts as an attempt; the reschedule did not');
  assert.strictEqual(await q.getFailedCount(), 0);
});

test('BullMQ limiter enforces a minimum gap between sends even at concurrency 5', async () => {
  const name = uniq(), gap = 300, stamps: number[] = [];
  const q = new Queue(name, { connection: mk() });
  const events = new QueueEvents(name, { connection: mk() });
  const w = new Worker(name, async () => { stamps.push(Date.now()); }, { connection: mk(), concurrency: 5, limiter: { max: 1, duration: gap } });
  cleanup.push(async () => { await w.close(); await events.close(); await q.obliterate({ force: true }); await q.close(); });
  const jobs = await Promise.all(Array.from({ length: 5 }, (_, i) => q.add('send', {}, { jobId: `j${i}` })));
  await Promise.all(jobs.map((j) => j.waitUntilFinished(events, 10_000)));
  stamps.sort((a, b) => a - b);
  for (let i = 1; i < stamps.length; i++) assert.ok(stamps[i] - stamps[i - 1] >= gap - 40, `gap ${stamps[i] - stamps[i - 1]}ms < ${gap}ms`);
});

test('RESTART: a delayed job survives closing every connection and still fires on time, exactly once', async () => {
  const name = uniq();
  const q1 = new Queue(name, { connection: mk() });
  const fireAt = Date.now() + 1200;
  await q1.add('send', { id: 'future' }, { jobId: 'eml_future', delay: 1200 });
  await q1.close(); // "server stops": nothing in this process holds the job any more

  const q2 = new Queue(name, { connection: mk() });                 // "server starts again"
  assert.strictEqual(await q2.getDelayedCount(), 1, 'job must still be in Redis');
  const seen: number[] = [];
  const events = new QueueEvents(name, { connection: mk() });
  const w = new Worker(name, async () => { seen.push(Date.now()); }, { connection: mk() });
  cleanup.push(async () => { await w.close(); await events.close(); await q2.obliterate({ force: true }); await q2.close(); });
  const j = await q2.getJob('eml_future');
  await j!.waitUntilFinished(events, 6000);
  assert.strictEqual(seen.length, 1, 'sent exactly once');
  assert.ok(seen[0] >= fireAt - 50, 'must not fire early');
  assert.ok(seen[0] < fireAt + 2500, 'fires at the original time, not restarted from scratch');
});
