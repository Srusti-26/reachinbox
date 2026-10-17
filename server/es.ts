import { Client } from '@elastic/elasticsearch';
import { config } from './config.js';
import type { ScheduledEmailItem } from '../src/types.js';

const INDEX = 'reachinbox-emails';
let client: Client | null = null;
let ready = false;

export const isSearchReady = () => ready;

/** Connects and creates the index. If ES is down the app still works: search falls back to SQL. */
export async function initSearch(): Promise<boolean> {
  try {
    client = new Client({ node: config.esUrl, requestTimeout: 3000, maxRetries: 1 });
    await client.ping();
    const exists = await client.indices.exists({ index: INDEX });
    if (!exists) {
      await client.indices.create({
        index: INDEX,
        mappings: {
          properties: {
            userId: { type: 'keyword' },
            campaignId: { type: 'keyword' },
            status: { type: 'keyword' },
            recipientEmail: { type: 'text', fields: { raw: { type: 'keyword' } } },
            senderEmail: { type: 'text', fields: { raw: { type: 'keyword' } } },
            subject: { type: 'text' },
            body: { type: 'text' },
            scheduledTime: { type: 'date' },
            sentTime: { type: 'date' },
          },
        },
      });
    }
    ready = true;
    console.log('[Search] Elasticsearch ready');
  } catch (err: any) {
    ready = false;
    console.warn('[Search] Elasticsearch unavailable, using SQL search fallback:', err.message);
  }
  return ready;
}

const toDoc = (userId: string, e: ScheduledEmailItem) => ({
  userId,
  campaignId: e.campaignId,
  status: e.status,
  recipientEmail: e.recipientEmail,
  senderEmail: e.senderEmail,
  subject: e.subject,
  body: e.body,
  scheduledTime: e.scheduledTime,
  sentTime: e.sentTime ?? null,
});

/** Never throws: indexing is best-effort, Postgres stays the source of truth. */
export async function indexEmails(userId: string, emails: ScheduledEmailItem[]): Promise<void> {
  if (!ready || !client || emails.length === 0) return;
  try {
    const operations = emails.flatMap((e) => [{ index: { _index: INDEX, _id: e.id } }, toDoc(userId, e)]);
    const res = await client.bulk({ operations, refresh: false });
    if (res.errors) console.warn('[Search] Some documents failed to index');
  } catch (err: any) {
    console.warn('[Search] indexEmails failed (non-fatal):', err.message);
  }
}

export async function updateEmailDoc(id: string, partial: Record<string, unknown>): Promise<void> {
  if (!ready || !client) return;
  try {
    await client.update({ index: INDEX, id, doc: partial, retry_on_conflict: 3 });
  } catch (err: any) {
    console.warn('[Search] updateEmailDoc failed (non-fatal):', err.message);
  }
}

export interface EsQuery {
  userId: string;
  term: string;
  type?: 'scheduled' | 'sent' | 'all';
  status?: string;
  offset: number;
  limit: number;
}

export async function esSearch(q: EsQuery): Promise<{ items: ScheduledEmailItem[]; total: number; tookMs: number }> {
  if (!client) throw new Error('ES not initialised');
  const filter: any[] = [{ term: { userId: q.userId } }];
  if (q.status && q.status !== 'all') filter.push({ term: { status: q.status.toLowerCase() } });
  else if (q.type === 'scheduled') filter.push({ terms: { status: ['scheduled', 'queued', 'processing'] } });
  else if (q.type === 'sent') filter.push({ terms: { status: ['sent', 'failed'] } });

  const t = q.term.trim();
  const res = await client.search({
    index: INDEX,
    from: q.offset,
    size: q.limit,
    track_total_hits: true,
    sort: [{ [q.type === 'sent' ? 'sentTime' : 'scheduledTime']: { order: q.type === 'sent' ? 'desc' : 'asc', unmapped_type: 'date' } }],
    query: {
      bool: {
        filter,
        must: [
          {
            bool: {
              minimum_should_match: 1,
              should: [
                { multi_match: { query: t, fields: ['recipientEmail^3', 'subject^2', 'body', 'senderEmail'], fuzziness: 'AUTO' } },
                // partial address match, e.g. "doe@comp"
                { wildcard: { 'recipientEmail.raw': { value: `*${t.toLowerCase()}*`, case_insensitive: true } } },
              ],
            },
          },
        ],
      },
    },
  });

  const total = typeof res.hits.total === 'number' ? res.hits.total : res.hits.total?.value ?? 0;
  const items = res.hits.hits.map((h) => {
    const s = h._source as any;
    return {
      id: h._id as string,
      campaignId: s.campaignId,
      recipientEmail: s.recipientEmail,
      subject: s.subject,
      body: s.body,
      scheduledTime: s.scheduledTime,
      sentTime: s.sentTime ?? undefined,
      status: s.status,
      senderEmail: s.senderEmail,
      senderName: '',
      delaySeconds: 0,
    } as ScheduledEmailItem;
  });
  return { items, total, tookMs: res.took };
}
