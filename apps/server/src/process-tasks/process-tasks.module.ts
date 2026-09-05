import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { FlowModule } from '../flow/flow.module'
import { ProcessTasksController } from './process-tasks.controller'
import { ProcessTasksService } from './process-tasks.service'

@Module({
  imports: [AuthModule, FlowModule],
  controllers: [ProcessTasksController],
  providers: [ProcessTasksService],
  exports: [ProcessTasksService],
})
export class ProcessTasksModule {}
