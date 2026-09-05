import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ProcessesController } from './processes.controller'

@Module({ imports: [AuthModule], controllers: [ProcessesController] })
export class ProcessesModule {}
