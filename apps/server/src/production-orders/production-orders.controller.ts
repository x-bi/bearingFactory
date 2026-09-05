import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import type { AuthenticatedRequest } from '../auth/auth.types'
import { CreateProductionOrderDto } from './dto/create-production-order.dto'
import { ListProductionOrdersDto } from './dto/list-production-orders.dto'
import { ProductionOrdersService } from './production-orders.service'

@Controller('production-orders')
@UseGuards(JwtAuthGuard)
export class ProductionOrdersController {
  constructor(private readonly service: ProductionOrdersService) {}

  @Get()
  list(@Query() query: ListProductionOrdersDto) {
    return this.service.list(query)
  }

  @Post()
  create(
    @Body() dto: CreateProductionOrderDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.create(dto, request.user.id)
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id)
  }
}
