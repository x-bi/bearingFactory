import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class ListProductionOrdersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20

  @IsOptional()
  @IsIn(['UNSCHEDULED', 'PENDING', 'PROCESSING', 'PAUSED', 'COMPLETED'])
  status?: string

  @IsOptional()
  @IsString()
  keyword?: string
}
