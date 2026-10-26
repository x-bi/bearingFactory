import { Type } from 'class-transformer'
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export class InitialTaskDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  startProcessId!: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  startWorkstationId?: number
}

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
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InitialTaskDto)
  initialTasks?: InitialTaskDto[]

  @IsOptional()
  @IsDateString()
  dueDate?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  startProcessId?: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  startWorkstationId?: number

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string
}
