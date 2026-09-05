import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { FlowModule } from './flow/flow.module'
import { HealthModule } from './health/health.module'
import { PrismaModule } from './prisma/prisma.module'
import { ProcessesModule } from './processes/processes.module'
import { ProcessTasksModule } from './process-tasks/process-tasks.module'
import { ProductionOrdersModule } from './production-orders/production-orders.module'
import { WorkstationsModule } from './workstations/workstations.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    FlowModule,
    HealthModule,
    ProcessesModule,
    ProcessTasksModule,
    WorkstationsModule,
    ProductionOrdersModule,
  ],
})
export class AppModule {}
