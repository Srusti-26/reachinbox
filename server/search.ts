import { db } from './db.js';
import { ScheduledEmailItem } from '../src/types.js';
import { esSearch, isSearchReady } from './es.js';

export interface SearchQuery {
  userId: string;
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
  engine: 'elasticsearch' | 'sql';
}

/**
 * Free-text queries go to Elasticsearch (fuzzy, ranked). Plain listings and filters come from Postgres,
 * which is always consistent; ES refreshes ~1s behind, which would make a just-scheduled batch look missing.
 * If ES is down or errors, the SQL path answers instead, so search never takes the dashboard down.
 */
export async function searchEmails(query: SearchQuery): Promise<SearchResult> {
  const started = Date.now();
  const offset = query.offset || 0;
  const limit = query.limit || 10;
  const term = query.term?.trim() || '';

  if (term && isSearchReady()) {
    try {
      const r = await esSearch({ userId: query.userId, term, type: query.type, status: query.status, offset, limit });
      return { total: r.total, items: r.items, hitsCount: r.items.length, tookMs: r.tookMs, engine: 'elasticsearch' };
    } catch (err: any) {
      console.warn('[Search] ES query failed, falling back to SQL:', err.message);
    }
  }

  const r = await db.searchEmailsForUser(query.userId, { type: query.type, status: query.status, term, offset, limit });
  return { total: r.total, items: r.items, hitsCount: r.items.length, tookMs: Date.now() - started, engine: 'sql' };
}
