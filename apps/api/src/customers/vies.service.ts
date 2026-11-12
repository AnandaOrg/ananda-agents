import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { ParsedVat, ViesResult } from '@ananda-agents/shared';
import { InjectDb, type Db } from '../db/db.module';
import { viesCache } from '../db/schema';

const VALID_TTL_MS = 30 * 86_400_000;
const INVALID_TTL_MS = 86_400_000;
const TIMEOUT_MS = 3_000;

interface ViesResponse {
  isValid?: boolean;
  valid?: boolean;
  name?: string;
  address?: string;
  userError?: string;
}

const clean = (s: string | undefined | null) => {
  const v = (s ?? '').replace(/\s*\n\s*/g, ', ').replace(/\s+/g, ' ').trim();
  return v && v !== '---' ? v : null;
};

/**
 * EU VIES VAT check (FR-02). Results are cached; when VIES is slow or down a stale cached
 * result is used, otherwise the caller offers manual entry flagged for Admin review.
 */
@Injectable()
export class ViesService {
  private readonly log = new Logger('VIES');

  constructor(@InjectDb() private readonly db: Db) {}

  async check(vat: ParsedVat): Promise<ViesResult> {
    const [cached] = await this.db.select().from(viesCache).where(eq(viesCache.vatNumber, vat.full));
    const age = cached ? Date.now() - cached.checkedAt.getTime() : Infinity;
    if (cached && age < (cached.valid ? VALID_TTL_MS : INVALID_TTL_MS)) return this.fromCache(cached);

    const live = await this.fetchLive(vat);
    if (live.status === 'unavailable') return cached ? this.fromCache(cached) : live;
    await this.db
      .insert(viesCache)
      .values({ vatNumber: vat.full, valid: live.status === 'valid', name: live.name, address: live.address, country: vat.country })
      .onConflictDoUpdate({
        target: viesCache.vatNumber,
        set: { valid: live.status === 'valid', name: live.name, address: live.address, checkedAt: new Date() },
      });
    return live;
  }

  private fromCache(c: typeof viesCache.$inferSelect): ViesResult {
    return { status: c.valid ? 'valid' : 'invalid', vatNumber: c.vatNumber, country: c.country, name: c.name, address: c.address, checkedAt: c.checkedAt.toISOString() };
  }

  private async fetchLive(vat: ParsedVat): Promise<ViesResult> {
    const base: ViesResult = { status: 'unavailable', vatNumber: vat.full, country: vat.country, name: null, address: null, checkedAt: null };
    if (process.env.VIES_OFFLINE === 'true') return base;
    const url = `${process.env.VIES_URL ?? 'https://ec.europa.eu/taxation_customs/vies/rest-api'}/ms/${vat.vatCountry}/vat/${encodeURIComponent(vat.number)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
      if (!res.ok) return base;
      const body = (await res.json()) as ViesResponse;
      const valid = body.isValid ?? body.valid;
      if (valid === true) return { ...base, status: 'valid', name: clean(body.name), address: clean(body.address), checkedAt: new Date().toISOString() };
      if (valid === false && (!body.userError || body.userError === 'INVALID')) return { ...base, status: 'invalid', checkedAt: new Date().toISOString() };
      return base;
    } catch (e) {
      this.log.warn(`VIES unavailable for ${vat.full}: ${(e as Error).message}`);
      return base;
    }
  }
}
