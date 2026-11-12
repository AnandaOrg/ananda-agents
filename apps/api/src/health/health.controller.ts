import { Controller, Get } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Health } from '@ananda-agents/shared';
import { InjectDb, type Db } from '../db/db.module';
import { Public } from '../core/context';

@Public()
@Controller('health')
export class HealthController {
  constructor(@InjectDb() private readonly db: Db) {}

  @Get()
  async get(): Promise<Health> {
    let db: Health['db'] = 'up';
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      db = 'down';
    }
    return { ok: db === 'up', db, time: new Date().toISOString() };
  }
}
