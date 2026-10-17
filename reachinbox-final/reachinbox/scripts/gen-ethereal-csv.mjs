// Run this after logging in: node scripts/gen-ethereal-csv.mjs
// It fetches your actual Ethereal sender email and writes demo-ethereal.csv

import fs from 'fs';

const BASE = 'http://localhost:3000';

async function main() {
  // 1. Get settings (includes senders)
  const res = await fetch(`${BASE}/api/v1/settings`, { credentials: 'include' });
  if (!res.ok) {
    console.error('Not logged in or server not running. Start the app and log in first.');
    process.exit(1);
  }
  const { senders } = await res.json();

  const etherealSenders = senders.filter(s => s.type === 'ethereal' && s.email.includes('@'));
  if (etherealSenders.length === 0) {
    console.error('No Ethereal senders found. Go to Settings -> Provision Ethereal Senders first.');
    process.exit(1);
  }

  // 2. Use the Ethereal sender email as recipient (Ethereal accepts mail to its own accounts)
  const lines = ['email,name'];
  etherealSenders.forEach((s, i) => {
    lines.push(`${s.email},Ethereal Test ${i + 1}`);
  });
  // Add a couple extra dummy addresses that Ethereal will accept
  lines.push('test.inbox@ethereal.email,Test Inbox');
  lines.push('demo.recipient@ethereal.email,Demo Recipient');

  const csv = lines.join('\n') + '\n';
  fs.writeFileSync('demo-ethereal.csv', csv);
  console.log('Written demo-ethereal.csv:');
  console.log(csv);
}

main().catch(console.error);
