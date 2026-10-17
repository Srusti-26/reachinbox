# ReachInbox — Email Job Scheduler + Dashboard

Schedules and sends emails at scale with **BullMQ delayed jobs on Redis** (no cron), per-sender hourly
rate limits, worker concurrency, restart-safe persistence, Slack alerts, Elasticsearch search, and a React dashboard.

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Tailwind v4 (Vite, served by Express in dev) |
| Backend | Node, Express, TypeScript |
| Queue | BullMQ + Redis (AOF persistence) |
| DB | PostgreSQL via Prisma |
| Search | Elasticsearch (SQL fallback if unavailable) |
| Mail | Nodemailer + Ethereal (fake SMTP) |
| Auth | Google OAuth 2.0 (Passport) |
| Alerts | Slack OAuth v2 (per-user incoming webhook) |
| Queue UI | Bull Board at `/admin/queues` |

---

## 1. Run it

```bash
docker compose up -d                 # Postgres, Redis (AOF), Elasticsearch
cp .env.example .env                 # then fill in the values below
npm install
npx prisma generate && npx prisma db push
npm run dev                          # API + BullMQ worker + frontend on http://localhost:3000
```

Open http://localhost:3000, click **Continue with Google**.

Useful URLs: dashboard `/`, queue dashboard `/admin/queues` (login required), health `/health`.

### Environment

All throughput limits are env-driven (see `.env.example` for everything):

| Var | Meaning | Default |
|---|---|---|
| `WORKER_CONCURRENCY` | Parallel jobs per worker process | 5 |
| `MIN_DELAY_BETWEEN_SENDS_MS` | Min gap between **any** two sends (BullMQ limiter, shared by all workers) | **2000** (2 s) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Hard hourly ceiling per sender mailbox | 200 |

### Google OAuth
Google Cloud Console → Credentials → OAuth client (Web). Redirect URI: `http://localhost:3000/api/v1/auth/google/callback`.
Put the ID/secret in `.env`.

### Ethereal (fake SMTP)
Nothing to configure. On first login each user gets **3 Ethereal mailboxes created automatically**
(`nodemailer.createTestAccount()`), stored as senders. Campaigns rotate across them, so the rate limit is genuinely
per sender. Each sent email gets an Ethereal **preview link** in the Sent table. More: Settings → mailboxes, or
`POST /api/v1/senders/provision-ethereal`.

### Slack (real OAuth)
1. https://api.slack.com/apps → Create app → OAuth & Permissions → add scope **`incoming-webhook`**.
2. Add redirect URL = `SLACK_REDIRECT_URI` (default `http://localhost:3000/api/v1/slack/oauth/callback`).
   If Slack refuses `http://localhost`, use an https tunnel and set `APP_URL` + `SLACK_REDIRECT_URI` to it.
3. Put the client ID and secret in `.env`.
4. In the dashboard: **Connect Slack → Connect with Slack** → pick a channel → done.

---

## 2. Architecture

### Scheduling
`POST /api/v1/campaigns` validates and de-duplicates leads, then writes the campaign and one `scheduled_emails` row per
lead to Postgres (sender chosen round-robin, `scheduledTime = start + i × delay`). Each row becomes **one BullMQ delayed
job with `jobId = emailId`**. No cron library anywhere (BullMQ is the only scheduler).

### Persistence across restarts
- Delayed jobs live in Redis, which runs with **AOF on** (`docker-compose.yml`). Stop/start the server and they fire at their original time.
- Postgres is the source of truth. On every boot `reconcileQueue()` runs **once** (not cron): rows stuck in `processing`
  from a crashed worker go back to `scheduled`, and any pending row without a job is re-enqueued. It's idempotent
  because the job id is the email id.
- Graceful shutdown (SIGINT/SIGTERM) lets in-flight sends finish.

### Idempotency (no duplicate sends)
1. Enqueue is idempotent: same `jobId` ⇒ BullMQ keeps one job.
2. The worker does an **atomic DB claim** (`UPDATE … SET status='processing' WHERE id=? AND status IN ('scheduled','queued')`).
   Only one worker can win, so stalled-job re-runs and duplicate deliveries are skipped.
3. A stable `Message-ID` (`<emailId@reachinbox.local>`) is sent with every email.

### Rate limiting (per sender, per hour)
- Redis key `rl:{sender}:{hourWindow}` where `hourWindow = floor(epochMs / 3_600_000)` (timezone-independent).
- One **Lua script** checks and increments atomically, so concurrent workers/instances can't overshoot the cap.
- Effective cap = **min(campaign "Hourly limit", mailbox limit, `MAX_EMAILS_PER_HOUR_PER_SENDER`)**.
- When the cap is hit, the job is **not failed or dropped**: the same job is moved with `moveToDelayed` +
  `DelayedError` to just after the next hour window, with a tiny offset derived from its original time so earlier
  emails stay ahead of later ones. A failed SMTP send gives its slot back.
- Trade-off: the counter is per mailbox across all campaigns, so two campaigns on one mailbox share its budget.

### Concurrency and minimum delay
- `WORKER_CONCURRENCY` jobs run in parallel; every shared state change is atomic (DB claim, Lua counter, atomic campaign counters).
- **Minimum delay: 2 seconds between sends** (`MIN_DELAY_BETWEEN_SENDS_MS`) via BullMQ's `limiter: { max: 1, duration: 2000 }`.
  It's queue-wide (shared by every worker). The per-campaign "Delay between emails" from the UI spaces out *scheduled times*; the limiter is the global floor.

### Behaviour under load (1000+ emails at the same time)
All 1000 rows + jobs are created immediately (cheap delayed jobs). The limiter releases one send per 2 s; each sender stops
at its cap, remaining jobs slide into the next hour window in order, and a single Slack alert fires per sender per window.
Nothing is lost. Try it: `node scripts/demo-load.mjs 1000 5` (see §4).

### Slack alert
OAuth v2 callback stores the **per-user** incoming webhook (state parameter checked against the session, CSRF guard).
When a sender hits its cap the worker posts to **that user's** channel, **once per user+sender+hour window**
(Redis `SET NX`, correct across multiple workers). Not connected ⇒ silently skipped (no crash, and the once-per-window
claim isn't burned). Connect later ⇒ works on the next hit, no redeploy. Disconnect clears the webhook and token.

### Search & queue visibility
Every scheduled email is indexed in Elasticsearch (status updated on send/fail). Free-text search (fuzzy + partial address)
uses ES; plain listings use Postgres (always consistent; ES refreshes ~1 s behind). If ES is down the SQL path answers.
Live queue dashboard: **Bull Board** at `/admin/queues`, plus the in-app Queue Monitor.

---

## 3. Features implemented

**Backend:** BullMQ delayed scheduling (no cron) · Postgres persistence · restart recovery · idempotent claim + enqueue ·
Redis-Lua per-sender hourly limit with reschedule to next window · configurable concurrency and min delay ·
multiple Ethereal senders (round-robin) · Slack OAuth + live rate-limit alerts · Elasticsearch indexing/search ·
Bull Board · per-user data isolation on every list/stat/action · Google OAuth sessions.

**Frontend:** Google login, header with name/email/avatar + logout · dashboard with metric cards · Scheduled and Sent tables
(search, status filter, pagination, loading + empty states, toasts) · 3-step Compose wizard (subject/body → CSV/TXT upload
with parsed count → start time, delay, hourly limit → Schedule) · Connect Slack modal · Settings (mailboxes, queue tuning).

---

## 4. Demo checklist (for the ≤5 min video)

1. Log in with Google. Compose → upload a CSV → start in ~1 min → Schedule. Show it in **Scheduled**, then in **Sent** (open an Ethereal preview).
2. **Restart:** schedule a few emails ~2 min out → `Ctrl+C` the server → `npm run dev` again → watch them still send on time, once each (also visible in `/admin/queues`).
3. **Rate limit + Slack:** connect Slack, set Hourly limit to 3 on a campaign of 10 → Slack message arrives, remaining emails show a next-hour scheduled time, none failed.
4. **Load (bonus):** `ALLOW_DEV_LOGIN=true npm run dev`, then `node scripts/demo-load.mjs 1000 5`.

Tests (need a Redis): `REDIS_URL=redis://localhost:6379 npm test` — atomic limiter under concurrency, cross-connection
sharing, window math in any timezone, once-per-window alerts, `DelayedError` reschedule, min-gap limiter, restart persistence.

---

## 5. Assumptions, shortcuts, trade-offs

- **Delivery guarantee is at-least-once in one narrow window:** if a worker dies after SMTP accepted a message but before the DB write, boot reconcile will re-send it. The stable Message-ID helps real providers dedupe; Ethereal does not.
- **API and worker share one process** for simplicity (`npm run dev`). They're decoupled via Redis, so the worker can be split out.
- **Open rate card is a static placeholder** (the Figma has it; there's no tracking pixel).
- ES is eventually consistent (~1 s) and best-effort: failures never block sending.
- The limiter is queue-wide, not per sender: a conservative global throttle.
- Dev login (`ALLOW_DEV_LOGIN=true`, never in production) creates a real local user for demos without Google credentials.
- `bullmq` pulls in `cron-parser` as an internal dependency for its own repeatable-jobs feature; it is not used here.
