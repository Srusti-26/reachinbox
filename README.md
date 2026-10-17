# ReachInbox — Full-Stack Email Job Scheduler

A production-grade email campaign scheduling platform built for the ReachInbox hiring assignment.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS v4 |
| Backend | Node.js, Express, TypeScript |
| Queue | **BullMQ** + **Redis** (persistent delayed jobs) |
| Database | **PostgreSQL** via **Prisma ORM** |
| Email | **Nodemailer** + **Ethereal Email** sandbox |
| Auth | **Google OAuth 2.0** via Passport.js |
| Alerts | Slack Incoming Webhooks |

---

## 1. Prerequisites

- Node.js 18+
- Docker (for PostgreSQL + Redis)
- A Google Cloud project with OAuth 2.0 credentials (optional for dev)

---

## 2. Start Infrastructure (Docker)

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port `5432`
- Redis on port `6379`
- Elasticsearch on port `9200` (optional)

---

## 3. Environment Variables

```bash
cp .env.example .env
```

Fill in `.env`:

```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=your_random_secret_here

# Google OAuth — create at https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback

# PostgreSQL
DATABASE_URL="postgresql://reachinbox:reachinbox_secret@localhost:5432/reachinbox_db?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# Rate limiting
MAX_EMAILS_PER_HOUR=1000

# Slack (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Real SMTP (optional — leave blank to use Ethereal sandbox)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-16-char-app-password
```

---

## 4. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Push schema to PostgreSQL (creates all tables)
npx prisma db push
```

---

## 5. Run the Application

```bash
npm run dev
```

Open `http://localhost:3000`.

**Without Google OAuth credentials (dev mode):**
Click "Dev mode: skip OAuth" on the login screen to bypass Google sign-in.

---

## 6. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add Authorized redirect URI: `http://localhost:3000/api/v1/auth/google/callback`
4. Copy Client ID and Secret into `.env`

---

## 7. Run Tests

```bash
npx tsx tests/run-tests.ts
```

---

## Architecture

### Scheduling & Persistence

1. When a campaign is created via `POST /api/v1/campaigns`, each recipient becomes a `ScheduledEmail` row in PostgreSQL with a deterministic ID (`eml_{timestamp}_{idx}`).
2. Each email is added to BullMQ as a **delayed job** with `jobId = emailId` — this is the idempotency key. BullMQ stores jobs in Redis with their exact delay, so they survive server restarts automatically.
3. The BullMQ Worker picks up jobs when their delay expires and calls Nodemailer.

**Restart safety:** BullMQ persists all delayed jobs in Redis. On restart, the worker reconnects to Redis and continues processing — no jobs are lost or duplicated.

### Rate Limiting

- Per-sender hourly rate limiting uses a **Redis counter** keyed by `rate:{senderEmail}:{hourKey}`.
- Before sending, the worker atomically increments the counter (`INCR`). If the result exceeds the sender's `hourlyLimit`, it decrements back and **reschedules the job** to the next hour boundary using BullMQ's `delay` option.
- This is safe across multiple workers/instances because Redis `INCR` is atomic.
- A Slack alert fires once per sender per hour when the limit is hit.

### Concurrency

- BullMQ Worker is configured with `concurrency: 5` (configurable via Settings UI → saved to PostgreSQL).
- A BullMQ `limiter` of `max: 10 per 1000ms` prevents SMTP flooding.

### Idempotency

- Each email job uses `jobId = emailId` in BullMQ — duplicate `addJob` calls with the same ID are silently ignored by Redis.
- Worker checks `email.status` before processing — already `sent` or `cancelled` emails are skipped.

---

## Features Implemented

### Backend
- ✅ BullMQ delayed job scheduling (no cron)
- ✅ PostgreSQL persistence via Prisma ORM
- ✅ Redis-backed per-sender hourly rate limiting
- ✅ Automatic job rescheduling on rate limit hit
- ✅ Configurable worker concurrency
- ✅ Minimum delay between sends (BullMQ limiter)
- ✅ Idempotent job IDs (no duplicate sends on restart)
- ✅ Nodemailer + Ethereal Email sandbox delivery
- ✅ Real-world SMTP support (Gmail, Resend, Brevo, custom)
- ✅ Slack webhook alerts on rate limit hit
- ✅ Google OAuth 2.0 via Passport.js
- ✅ Full-text search across emails (subject, recipient, body)
- ✅ Pagination on scheduled/sent email lists

### Frontend
- ✅ Google OAuth login (real redirect flow)
- ✅ Dashboard with 4 KPI metric cards
- ✅ 3-step Compose Wizard (subject/body → CSV upload → schedule)
- ✅ CSV parsing with deduplication and validation
- ✅ Scheduled Emails table with search, filter, pagination
- ✅ Sent Emails table with Ethereal preview links
- ✅ Bull Queue Monitor modal (live BullMQ stats)
- ✅ Connect Slack modal with test notification
- ✅ Settings: SMTP mailbox management, queue tuning
- ✅ Real Email dispatcher (instant send to real inbox)
- ✅ Loading states, empty states, toast notifications

---

## Rate Limiting Details

- **Mechanism:** Redis `INCR` counter keyed by `rate:{senderEmail}:{YYYY-M-D:H}` (UTC hour window).
- **On limit hit:** Job is NOT dropped. BullMQ re-adds it with `delay = ms until next hour boundary`.
- **Slack alert:** Fires once per sender per hour via incoming webhook.
- **Configurable:** `MAX_EMAILS_PER_HOUR` env var + per-sender `hourlyLimit` in Settings UI.

## Delay Between Emails

- Minimum 30 seconds between sends per sender (configurable in Settings).
- Enforced via BullMQ's `limiter: { max: 10, duration: 1000 }` + per-recipient scheduled delay offsets.

## Behavior Under 1000+ Emails

- All 1000 emails are stored in PostgreSQL and added to BullMQ as delayed jobs immediately.
- Jobs are spread across time using `startTimestamp + (idx * delayMs)`.
- When the hourly limit is hit, remaining jobs are automatically rescheduled to the next hour — no manual intervention needed.
