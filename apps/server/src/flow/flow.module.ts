import { Module } from '@nestjs/common'
import { FlowStateService } from './flow-state.service'

@Module({ providers: [FlowStateService], exports: [FlowStateService] })
export class FlowModule {}
