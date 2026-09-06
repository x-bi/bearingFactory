import { Type } from 'class-transformer'
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator'

export class ScrapTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  requestId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string
}
