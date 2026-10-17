// Demo: schedule N emails at once with a tiny hourly cap and watch the queue absorb it.
//   ALLOW_DEV_LOGIN=true npm run dev     (terminal 1)
//   node scripts/demo-load.mjs 1000 5    (terminal 2)  -> 1000 emails, cap of 5/hr per sender
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const N = Number(process.argv[2] || 1000);
const CAP = Number(process.argv[3] || 5);

const login = await fetch(`${BASE}/api/v1/auth/dev-login`, { method: 'POST' });
if (!login.ok) throw new Error(`dev-login failed (${login.status}). Start the server with ALLOW_DEV_LOGIN=true`);
const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const api = (path, init = {}) => fetch(`${BASE}/api/v1${path}`, { ...init, headers: { 'Content-Type': 'application/json', cookie, ...(init.headers || {}) } });

const recipients = Array.from({ length: N }, (_, i) => ({ email: `lead${i}@example.test`, name: `Lead ${i}` }));
const t0 = Date.now();
const res = await api('/campaigns', {
  method: 'POST',
  body: JSON.stringify({ subject: 'Load demo', body: 'Hi {{name}}, this is a load test.', recipients, startTime: new Date().toISOString(), delaySeconds: 0, hourlyLimit: CAP }),
});
const out = await res.json();
console.log(`Scheduled ${out.scheduledCount} emails in ${Date.now() - t0}ms (HTTP ${res.status}); hourly cap per sender = ${CAP}`);

for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const h = await (await api('/queue/health')).json();
  const s = await (await api('/stats')).json();
  console.log(`[+${(i + 1) * 5}s] waiting=${h.waiting} active=${h.active} delayed=${h.delayed} failed=${h.failed} | sent=${s.sentEmails} scheduled=${s.scheduledEmails} failedEmails=${s.failedEmails}`);
}
console.log('Expect: sent stops at ~cap x senders, the rest stay "scheduled" (delayed to the next hour window), failed stays 0.');
