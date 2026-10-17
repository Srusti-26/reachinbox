import IORedis from 'ioredis';
import { config } from './config.js';

// One shared connection for Queue + Worker + rate-limit counters.
// maxRetriesPerRequest must be null for BullMQ's blocking commands.
export const redisConnection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisConnection.on('error', (err) => console.error('[Redis] Connection error:', err.message));
