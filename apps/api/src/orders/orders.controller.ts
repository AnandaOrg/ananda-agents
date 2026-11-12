import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { noteSchema, reminderSchema, saleSchema, type SaleInput } from '@ananda-agents/shared';
import { CurrentUser, Roles, type AuthUser } from '../core/context';
import { ZodPipe } from '../core/zod.pipe';
import { OrdersService } from './orders.service';
import { SalesService } from './sales.service';

@Roles('agent')
@Controller()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly sales: SalesService,
  ) {}

  @Post('sales')
  send(@CurrentUser() user: AuthUser, @Body(new ZodPipe(saleSchema)) body: SaleInput) {
    return this.sales.send(user, body);
  }

  @Get('orders')
  list(@CurrentUser() user: AuthUser) {
    return this.orders.list(user);
  }

  @Get('orders/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.detail(user, id);
  }

  @Get('orders/:id/proforma.pdf')
  async pdf(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { number, pdf } = await this.orders.pdf(user, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${number}.pdf"`);
    res.send(pdf);
  }

  @Post('orders/:id/corrections')
  correction(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(noteSchema)) body: { note: string }) {
    return this.orders.requestCorrection(user, id, body.note);
  }

  @Get('orders/:id/reminder-draft')
  draft(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.draftReminder(user, id);
  }

  @Post('orders/:id/reminders')
  remind(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(reminderSchema)) body: { subject: string; body: string }) {
    return this.orders.sendReminder(user, id, body.subject, body.body);
  }

  @Get('collections')
  collections(@CurrentUser() user: AuthUser) {
    return this.orders.collections(user);
  }

  @Get('earnings')
  earnings(@CurrentUser() user: AuthUser) {
    return this.orders.earnings(user);
  }
}
