import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

export class UpdateMachineDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code?: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  processId?: number

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number
}
