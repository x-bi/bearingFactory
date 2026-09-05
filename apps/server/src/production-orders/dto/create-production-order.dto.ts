import { Type } from 'class-transformer'
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator'

export class CreateProductionOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  model!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  customer!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  batchNo!: string

  @IsOptional()
  @IsDateString()
  dueDate?: string

  @Type(() => Number)
  @IsInt()
  startProcessId!: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  startWorkstationId?: number

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string
}
