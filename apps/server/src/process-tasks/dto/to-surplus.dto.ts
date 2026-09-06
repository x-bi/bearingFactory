import { Type } from 'class-transformer'
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator'

export class ToSurplusDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  requestId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string
}
