import { db } from './db.js';
import { ScheduledEmailItem } from '../src/types.js';

export interface SearchQuery {
  term?: string;
  status?: string;
  type?: 'scheduled' | 'sent' | 'all';
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  total: number;
  items: ScheduledEmailItem[];
  hitsCount: number;
  tookMs: number;
}

export async function searchEmails(query: SearchQuery): Promise<SearchResult> {
  const startTime = Date.now();
  let list = await db.getEmails();

  if (query.type === 'scheduled') {
    list = list.filter((e) => e.status === 'scheduled' || e.status === 'queued' || e.status === 'processing');
  } else if (query.type === 'sent') {
    list = list.filter((e) => e.status === 'sent' || e.status === 'failed');
  }

  if (query.status && query.status !== 'all') {
    list = list.filter((e) => e.status.toLowerCase() === query.status?.toLowerCase());
  }

  if (query.term?.trim()) {
    const term = query.term.toLowerCase().trim();
    list = list.filter(
      (e) =>
        e.recipientEmail.toLowerCase().includes(term) ||
        e.subject.toLowerCase().includes(term) ||
        e.body?.toLowerCase().includes(term) ||
        e.senderEmail.toLowerCase().includes(term)
    );
  }

  const total = list.length;
  const offset = query.offset || 0;
  const limit = query.limit || 10;
  const items = list.slice(offset, offset + limit);

  return { total, items, hitsCount: items.length, tookMs: Date.now() - startTime };
}
