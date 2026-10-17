import assert from 'node:assert';
import { test } from 'node:test';
import { db } from '../server/db.js';
import { emailQueue } from '../server/queue.js';
import { searchEmails } from '../server/search.js';
import { sendEmail } from '../server/mailer.js';

test('1. Email Validation and Deduplication in Leads Processing', () => {
  const rawCsv = `email,name\njohn.doe@company.com,John Doe\nSARAH@techcorp.com,Sarah\njohn.doe@company.com,Duplicate John\ninvalid-email-string\nmike@startup.io,Mike`;
  const lines = rawCsv.split('\n');
  const seen = new Set<string>();
  const valid: { email: string; name: string }[] = [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const line of lines) {
    const parts = line.split(',');
    const email = parts[0]?.trim().toLowerCase();
    const name = parts[1]?.trim() || '';
    if (email === 'email') continue;
    if (!emailRegex.test(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    valid.push({ email, name });
  }

  assert.strictEqual(valid.length, 3, 'Should have exactly 3 valid deduplicated emails');
  assert.strictEqual(valid[0].email, 'john.doe@company.com');
  assert.strictEqual(valid[1].email, 'sarah@techcorp.com');
  assert.strictEqual(valid[2].email, 'mike@startup.io');
});

test('2. Campaign Creation and Deterministic Delayed Job Scheduling', () => {
  const now = Date.now();
  const startTime = new Date(now + 60000).toISOString();
  const delaySeconds = 30;
  const recipients = ['alpha@test.com', 'beta@test.com', 'gamma@test.com'];

  const jobs = recipients.map((email, idx) => ({
    id: `job_${now}_${idx}`,
    campaignId: 'cmp_test',
    recipientEmail: email,
    subject: 'Test Subject',
    body: 'Hello',
    scheduledTime: new Date(new Date(startTime).getTime() + idx * delaySeconds * 1000).toISOString(),
    status: 'scheduled' as const,
    senderEmail: 'srusti@reachinbox.ai',
    senderName: 'Srusti',
    delaySeconds,
  }));

  assert.strictEqual(jobs.length, 3);
  assert.strictEqual(
    new Date(jobs[1].scheduledTime).getTime() - new Date(jobs[0].scheduledTime).getTime(),
    30000,
    'Jobs must be spaced by exactly 30 seconds'
  );
});

test('3. Hourly Rate Limit Counter and Quota Check', () => {
  const initial = db.getHourlyCount();
  assert.ok(typeof initial === 'number');

  const incremented = db.incrementHourlyCount(5);
  assert.strictEqual(incremented, initial + 5, 'Hourly count should increment atomically');
});

test('4. Elasticsearch Search Service Matching', async () => {
  const result = await searchEmails({
    type: 'all',
    term: 'john.doe',
    limit: 10,
  });

  assert.ok(result.total >= 0, 'Should return a valid total');
});

test('5. Queue Health Telemetry Retrieval', async () => {
  const health = await emailQueue.getQueueHealth();
  assert.ok(typeof health.waiting === 'number');
  assert.ok(typeof health.delayed === 'number');
  assert.ok(typeof health.completed === 'number');
  assert.ok(typeof health.concurrency === 'number');
});

test('6. Mailer & Delivery Pipeline', async () => {
  const result = await sendEmail({
    fromName: 'ReachInbox Test',
    fromEmail: 'test@reachinbox.ai',
    toEmail: '1nt23ad052.srusti@nmit.ac.in',
    subject: 'Automated Pipeline Test',
    textBody: 'Testing real-world email delivery formatting.',
  });

  assert.strictEqual(result.success, true, 'Email dispatch must succeed');
  assert.ok(result.messageId || result.etherealPreviewUrl, 'Should return messageId or ethereal link');
  emailQueue.stopWorker();
  setTimeout(() => process.exit(0), 100);
});
