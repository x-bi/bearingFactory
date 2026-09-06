import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'

export class UpdateMachineDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number
}
