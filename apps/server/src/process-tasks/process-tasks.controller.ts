import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { AuthenticatedRequest } from '../auth/auth.types'
import { AssignTaskDto } from './dto/assign-task.dto'
import { TransferTaskDto } from './dto/transfer-task.dto'
import { UpdateCompletedDto } from './dto/update-completed.dto'
import { ProcessTasksService } from './process-tasks.service'

@Controller('process-tasks')
@UseGuards(JwtAuthGuard)
export class ProcessTasksController {
  constructor(private readonly service: ProcessTasksService) {}

  @Post(':id/assign')
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignTaskDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.assign(id, dto, request.user.id)
  }

  @Post(':id/start')
  start(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.start(id, request.user.id)
  }

  @Post(':id/pause')
  pause(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.pause(id, request.user.id)
  }

  @Post(':id/resume')
  resume(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.resume(id, request.user.id)
  }

  @Post(':id/update-completed')
  updateCompleted(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCompletedDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.updateCompleted(id, dto, request.user.id)
  }

  @Post(':id/complete')
  complete(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.complete(id, request.user.id)
  }

  @Post(':id/transfer')
  transfer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransferTaskDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.transfer(id, dto, request.user.id)
  }
}
