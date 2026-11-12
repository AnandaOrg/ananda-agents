import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { docNumber } from '@ananda-agents/shared';
import type { DbOrTx } from '../db/db.module';

// One numbering scheme across app, PDF and e-mail: orders and proformas are S-…, customers C-….
export const SEQUENCES = { order: 'S', customer: 'C' } as const;

@Injectable()
export class NumberingService {
  /** The counter row is locked by the upsert and rolls back with the transaction, so there are no gaps. */
  async next(tx: DbOrTx, key: keyof typeof SEQUENCES): Promise<string> {
    const res = await tx.execute<{ n: number }>(sql`
      INSERT INTO number_sequences (key, next) VALUES (${key}, 2)
      ON CONFLICT (key) DO UPDATE SET next = number_sequences.next + 1
      RETURNING next - 1 AS n`);
    return docNumber(SEQUENCES[key], Number(res.rows[0].n));
  }
}
