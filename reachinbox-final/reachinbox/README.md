<div align="center">

<img src="https://img.shields.io/badge/ReachInbox-Outreach%20Engine-5125F5?style=for-the-badge&logoColor=white" />

# ReachInbox — Full-Stack Email Campaign Scheduler

**A production-grade email outreach platform built for the ReachInbox hiring assignment.**  
Schedule campaigns to thousands of leads, track delivery in real-time, and never lose a job on restart.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.prisma.io)
[![Redis](https://img.shields.io/badge/Redis-BullMQ-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

</div>

---

## Live Demo Preview

![App Demo](screenshots/Recording%202026-10-17%20192220.gif)

> Full walkthrough video — [Watch Screen Recording](screenshots/Screen%20Recording%202026-10-17%20202346.mp4)

---

## Screenshots

<table>
  <tr>
    <td align="center"><b>Login</b></td>
    <td align="center"><b>Dashboard</b></td>
  </tr>
  <tr>
    <td><img src="screenshots/login.jpeg" width="420"/></td>
    <td><img src="screenshots/Dashboard.jpeg" width="420"/></td>
  </tr>
  <tr>
    <td align="center"><b>Compose — Step 1 (Write Email)</b></td>
    <td align="center"><b>Compose — Step 2 (Upload Leads)</b></td>
  </tr>
  <tr>
    <td><img src="screenshots/Compose_Step1.jpeg" width="420"/></td>
    <td><img src="screenshots/Compose_Step2.jpeg" width="420"/></td>
  </tr>
  <tr>
    <td align="center"><b>Compose — Step 3 (Schedule)</b></td>
    <td align="center"><b>Scheduled Emails</b></td>
  </tr>
  <tr>
    <td><img src="screenshots/Compose_step3.jpeg" width="420"/></td>
    <td><img src="screenshots/Schedules_Emails.jpeg" width="420"/></td>
  </tr>
  <tr>
    <td align="center"><b>Sent Emails + Ethereal Preview</b></td>
    <td align="center"><b>Ethereal Email Inbox</b></td>
  </tr>
  <tr>
    <td><img src="screenshots/Sent_Emails.jpeg" width="420"/></td>
    <td><img src="screenshots/ethereal.email.jpeg" width="420"/></td>
  </tr>
  <tr>
    <td align="center"><b>Queue Monitor</b></td>
    <td align="center"><b>Slack Notification</b></td>
  </tr>
  <tr>
    <td><img src="screenshots/Queue_Monitor.jpeg" width="420"/></td>
    <td><img src="screenshots/Notification.jpeg" width="420"/></td>
  </tr>
  <tr>
    <td align="center"><b>Gmail Real Delivery</b></td>
    <td align="center"><b>Settings</b></td>
  </tr>
  <tr>
    <td><img src="screenshots/gmail-email-preview-redacted.jpg" width="420"/></td>
    <td><img src="screenshots/Settings.jpeg" width="420"/></td>
  </tr>
</table>

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS v4 |
| Backend | Node.js, Express, TypeScript |
| Queue | **BullMQ** + **Redis** (persistent delayed jobs) |
| Database | **PostgreSQL** via **Prisma ORM** |
| Email | **Nodemailer** + **Ethereal Email** sandbox + Gmail SMTP |
| Auth | **Google OAuth 2.0** via Passport.js |
| Alerts | Slack Incoming Webhooks |
| Search | Elasticsearch (SQL fallback) |

---

## Features

### Backend
- BullMQ delayed job scheduling — no cron, jobs survive restarts via Redis AOF
- PostgreSQL persistence via Prisma ORM
- Redis atomic Lua per-sender hourly rate limiting
- Automatic job rescheduling to next hour on rate limit hit
- Configurable worker concurrency + minimum delay between sends
- Idempotent job IDs — no duplicate sends on restart
- Nodemailer with domain-based routing (Gmail SMTP for real domains, Ethereal for sandbox)
- File attachment support (base64, up to 5MB per file, 10MB total)
- Slack webhook alerts on rate limit hit
- Google OAuth 2.0 via Passport.js
- Full-text search across emails (Elasticsearch + SQL fallback)
- Pagination on all email lists

### Frontend
- Google OAuth login + dev bypass mode
- Dashboard with 4 KPI metric cards
- 3-step Compose Wizard: subject/body editor → CSV upload → schedule settings
- File attachment upload in compose (multi-file, drag-and-drop)
- CSV parsing with deduplication and validation
- Scheduled Emails table with search, filter, pagination, Send Now
- Sent Emails table with Ethereal preview links
- Bull Queue Monitor modal (live BullMQ stats)
- Connect Slack modal with test notification
- Settings: SMTP mailbox management, queue tuning
- Loading states, empty states, toast notifications

---

## Quick Start

### 1. Prerequisites
- Node.js 18+
- Docker (for PostgreSQL + Redis)
- Google Cloud OAuth 2.0 credentials (optional for dev)

### 2. Start Infrastructure

```bash
docker-compose up -d
```

Starts PostgreSQL on `5432`, Redis on `6379`, Elasticsearch on `9200`.

### 3. Environment Variables

```bash
cp .env.example .env
```

Fill in `.env`:

```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=your_random_secret_here

GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback

DATABASE_URL="postgresql://reachinbox:reachinbox_secret@localhost:5432/reachinbox_db?schema=public"
REDIS_URL="redis://localhost:6379"

MAX_EMAILS_PER_HOUR=1000
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Real SMTP (optional — leave blank to use Ethereal sandbox)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-16-char-app-password
```

### 4. Database Setup

```bash
npx prisma generate
npx prisma db push
```

### 5. Run

```bash
npm run dev
```

Open `http://localhost:3000`.

> **No Google OAuth credentials?** Click **"Dev mode: skip OAuth"** on the login screen.

---

## Architecture

### Scheduling & Persistence

1. `POST /api/v1/campaigns` creates one `ScheduledEmail` row per recipient in PostgreSQL with a deterministic ID (`eml_{timestamp}_{idx}`).
2. Each email is added to BullMQ as a **delayed job** with `jobId = emailId` — the idempotency key.
3. BullMQ stores jobs in Redis with their exact delay — they survive server restarts automatically.
4. On boot, `reconcileQueue()` requeues any emails stuck in `processing` from a crashed worker.

### Rate Limiting

- Redis `INCR` counter keyed by `rate:{senderEmail}:{YYYY-M-D:H}` (UTC hour window).
- On limit hit: job is **not dropped** — rescheduled to next hour boundary via BullMQ `delay`.
- Slack alert fires once per sender per hour.
- Configurable via `MAX_EMAILS_PER_HOUR` env var + per-sender `hourlyLimit` in Settings.

### Domain-Based Email Routing

| Recipient Domain | Transport |
|---|---|
| `gmail.com`, `nmit.ac.in`, `outlook.com`, `hotmail.com`, `yahoo.com`, `outboxlabs.in`, `reachinbox.in` | Gmail SMTP (real delivery) |
| Everything else | Ethereal sandbox (preview URL in Sent table) |

### Idempotency

- `jobId = emailId` in BullMQ — duplicate `addJob` calls silently ignored.
- Worker checks `email.status` before processing — skips already `sent` or `cancelled` emails.

---

## Run Tests

```bash
npx tsx tests/run-tests.ts
```

---

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an **OAuth 2.0 Client ID** (Web application)
3. Add Authorized redirect URI: `http://localhost:3000/api/v1/auth/google/callback`
4. Copy Client ID and Secret into `.env`

---

<div align="center">

Built with dedication for the **ReachInbox** hiring assignment.

</div>
