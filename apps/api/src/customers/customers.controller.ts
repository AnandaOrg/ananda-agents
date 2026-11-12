import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { newCustomerSchema, optionalNoteSchema, priceRequestSchema, type NewCustomerInput } from '@ananda-agents/shared';
import { CurrentUser, Roles, type AuthUser } from '../core/context';
import { ZodPipe } from '../core/zod.pipe';
import { CustomersService } from './customers.service';

@Roles('agent')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.customers.overview(user);
  }

  @Get('search')
  search(@CurrentUser() user: AuthUser, @Query('q') q = '') {
    return this.customers.search(user, String(q).slice(0, 100));
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(newCustomerSchema)) body: NewCustomerInput) {
    return this.customers.create(user, body);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.detail(user, id);
  }

  @Post(':id/claim')
  claim(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.claim(user, id);
  }

  @Post(':id/take-over')
  takeOver(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(optionalNoteSchema)) body: { note?: string }) {
    return this.customers.requestTakeOver(user, id, body.note);
  }

  @Post(':id/remind-when-free')
  remindWhenFree(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.customers.remindWhenFree(user, id);
  }

  @Post(':id/price-requests')
  priceRequest(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(priceRequestSchema)) body: { targetUnitPriceCents: number; note?: string },
  ) {
    return this.customers.requestPrice(user, id, body.targetUnitPriceCents, body.note);
  }
}
