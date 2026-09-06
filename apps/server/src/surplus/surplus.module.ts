import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { SurplusController } from './surplus.controller'
import { SurplusService } from './surplus.service'

@Module({
  imports: [AuthModule],
  controllers: [SurplusController],
  providers: [SurplusService],
})
export class SurplusModule {}
