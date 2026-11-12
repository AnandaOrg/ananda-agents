import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { ProformaService } from './proforma.service';
import { SalesService } from './sales.service';

@Module({ imports: [CustomersModule], controllers: [OrdersController], providers: [OrdersService, SalesService, ProformaService] })
export class OrdersModule {}
