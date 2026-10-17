import { EmailAttachment } from '../src/types.js';

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // per file
export const MAX_TOTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024; // per campaign
export const MAX_ATTACHMENT_COUNT = 10;

type Result = { ok: true; attachments: EmailAttachment[] } | { ok: false; error: string };

/**
 * Validates attachments coming from the browser. Never trusts the client's `size`, `filename` or `contentType`:
 * size is recomputed from the decoded bytes, the filename is stripped of paths/control chars.
 */
export function validateAttachments(input: unknown): Result {
  if (input === undefined || input === null) return { ok: true, attachments: [] };
  if (!Array.isArray(input)) return { ok: false, error: 'Attachments must be a list.' };
  if (input.length > MAX_ATTACHMENT_COUNT) return { ok: false, error: `At most ${MAX_ATTACHMENT_COUNT} attachments are allowed.` };

  const out: EmailAttachment[] = [];
  let total = 0;

  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || typeof (raw as any).content !== 'string') {
      return { ok: false, error: 'Each attachment needs a filename and base64 content.' };
    }
    const a = raw as Record<string, unknown>;
    // tolerate a full data URL ("data:...;base64,XXXX")
    const content = (a.content as string).replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(content)) return { ok: false, error: 'Attachment content is not valid base64.' };

    const size = Buffer.from(content, 'base64').length;
    const filename = sanitizeFilename(a.filename);
    if (size === 0) return { ok: false, error: `"${filename}" is empty.` };
    if (size > MAX_ATTACHMENT_BYTES) return { ok: false, error: `"${filename}" exceeds the 5MB per-file limit.` };
    total += size;
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) return { ok: false, error: 'Attachments exceed the 10MB total limit.' };

    const ct = typeof a.contentType === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(a.contentType) ? a.contentType : 'application/octet-stream';
    out.push({ filename, content, contentType: ct, size });
  }
  return { ok: true, attachments: out };
}

export function sanitizeFilename(name: unknown): string {
  const base = (String(name ?? '').split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f"<>:|?*\\/]/g, '_').trim();
  return (base || 'attachment').slice(0, 120);
}
