import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { ListSurplusDto } from './dto/list-surplus.dto'
import { SurplusService } from './surplus.service'

@Controller('surplus')
@UseGuards(JwtAuthGuard)
export class SurplusController {
  constructor(private readonly service: SurplusService) {}

  @Get()
  list(@Query() query: ListSurplusDto) {
    return this.service.list(query)
  }
}
