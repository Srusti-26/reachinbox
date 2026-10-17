// Pure unit tests, no Redis/DB needed:  npx tsx --test tests/attachments.test.ts
import assert from 'node:assert';
import { test } from 'node:test';
import { validateAttachments, sanitizeFilename, MAX_ATTACHMENT_BYTES } from '../server/attachments.js';

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64');

test('no attachments is fine', () => {
  for (const v of [undefined, null, []]) assert.deepStrictEqual(validateAttachments(v), { ok: true, attachments: [] });
});

test('valid file: size is recomputed from bytes, not trusted from the client', () => {
  const r = validateAttachments([{ filename: 'a.txt', content: b64('hello'), contentType: 'text/plain', size: 999999 }]);
  assert.ok(r.ok);
  assert.strictEqual(r.attachments[0].size, 5);
});

test('data-URL prefix is tolerated', () => {
  const r = validateAttachments([{ filename: 'a.txt', content: 'data:text/plain;base64,' + b64('hi'), contentType: 'text/plain' }]);
  assert.ok(r.ok && r.attachments[0].content === b64('hi'));
});

test('path traversal / control chars in filenames are neutralised', () => {
  assert.strictEqual(sanitizeFilename('../../etc/passwd'), 'passwd');
  assert.strictEqual(sanitizeFilename('C:\\x\\evil.exe'), 'evil.exe');
  assert.strictEqual(sanitizeFilename('a\r\nBcc: x@y.z.txt'), 'a__Bcc_ x@y.z.txt');
  assert.strictEqual(sanitizeFilename(''), 'attachment');
});

test('rejects bad base64, empty files, oversize files, too many, and totals over 10MB', () => {
  assert.ok(!validateAttachments([{ filename: 'a', content: '***' }]).ok);
  assert.ok(!validateAttachments([{ filename: 'a', content: '' }]).ok);
  assert.ok(!validateAttachments([{ filename: 'a', content: b64(Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 1)) }]).ok);
  assert.ok(!validateAttachments(Array.from({ length: 11 }, () => ({ filename: 'a', content: b64('x') }))).ok);
  const four = Array.from({ length: 3 }, (_, i) => ({ filename: `f${i}`, content: b64(Buffer.alloc(4 * 1024 * 1024, 1)) }));
  assert.ok(!validateAttachments(four).ok, '3 x 4MB = 12MB total must be rejected');
  assert.ok(!validateAttachments('nope' as any).ok);
});

test('unknown content types fall back to octet-stream', () => {
  const r = validateAttachments([{ filename: 'a', content: b64('x'), contentType: 'x/../y; evil' }]);
  assert.ok(r.ok && r.attachments[0].contentType === 'application/octet-stream');
});
