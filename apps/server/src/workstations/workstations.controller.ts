import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { WorkstationsService } from './workstations.service'

@Controller('workstations')
@UseGuards(JwtAuthGuard)
export class WorkstationsController {
  constructor(private readonly service: WorkstationsService) {}

  @Get('map')
  map() {
    return this.service.map()
  }

  @Get()
  list(@Query('processCode') processCode?: string) {
    return this.service.list(processCode)
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id)
  }
}
