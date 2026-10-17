// Central, env-driven config. Nothing here is hardcoded in the worker.
const int = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
};

export const config = {
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  esUrl: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  // Worker
  workerConcurrency: int(process.env.WORKER_CONCURRENCY, 5),
  // Minimum gap between ANY two sends (BullMQ limiter: 1 job per N ms, shared by all workers).
  minDelayBetweenSendsMs: int(process.env.MIN_DELAY_BETWEEN_SENDS_MS, 2000),
  // Default per-sender cap if a sender/campaign doesn't specify its own.
  maxEmailsPerHourPerSender: int(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER, int(process.env.MAX_EMAILS_PER_HOUR, 200)),
  appUrl: process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,
  slack: {
    clientId: process.env.SLACK_CLIENT_ID || '',
    clientSecret: process.env.SLACK_CLIENT_SECRET || '',
    redirectUri:
      process.env.SLACK_REDIRECT_URI ||
      `${process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`}/api/v1/slack/oauth/callback`,
  },
  allowDevLogin: process.env.ALLOW_DEV_LOGIN === 'true' && process.env.NODE_ENV !== 'production',
};
