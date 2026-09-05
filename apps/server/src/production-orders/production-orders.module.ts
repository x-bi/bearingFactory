import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ProductionOrdersController } from './production-orders.controller'
import { ProductionOrdersService } from './production-orders.service'

@Module({
  imports: [AuthModule],
  controllers: [ProductionOrdersController],
  providers: [ProductionOrdersService],
})
export class ProductionOrdersModule {}
