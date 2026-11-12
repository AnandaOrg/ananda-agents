import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { DbModule } from './db/db.module';
import { CoreModule } from './core/core.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { HealthModule } from './health/health.module';
import { MeModule } from './me/me.module';
import { CustomersModule } from './customers/customers.module';
import { OrdersModule } from './orders/orders.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ...(process.env.VERCEL ? [] : [ScheduleModule.forRoot()]),
    DbModule,
    CoreModule,
    AuthModule,
    HealthModule,
    MeModule,
    CustomersModule,
    OrdersModule,
    NotificationsModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
