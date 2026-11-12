import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { ViesService } from './vies.service';

@Module({ controllers: [CustomersController], providers: [CustomersService, ViesService], exports: [CustomersService] })
export class CustomersModule {}
