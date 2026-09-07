import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { AuthenticatedRequest } from '../auth/auth.types'
import { CreateMachineDto } from './dto/create-machine.dto'
import { UpdateMachineDto } from './dto/update-machine.dto'
import { MachinesService } from './machines.service'

@Controller('machines')
@UseGuards(JwtAuthGuard)
export class MachinesController {
  constructor(private readonly service: MachinesService) {}

  @Get()
  list() {
    return this.service.list()
  }

  @Post()
  create(@Body() dto: CreateMachineDto, @Req() request: AuthenticatedRequest) {
    return this.service.create(dto, request.user.id)
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMachineDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.update(id, dto, request.user.id)
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.remove(id, request.user.id)
  }
}
