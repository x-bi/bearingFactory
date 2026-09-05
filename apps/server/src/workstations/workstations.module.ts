import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { FlowModule } from '../flow/flow.module'
import { WorkstationsController } from './workstations.controller'
import { WorkstationsService } from './workstations.service'

@Module({
  imports: [AuthModule, FlowModule],
  controllers: [WorkstationsController],
  providers: [WorkstationsService],
})
export class WorkstationsModule {}
