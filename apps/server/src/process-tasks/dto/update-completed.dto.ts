import { Type } from 'class-transformer'
import { IsInt, Min } from 'class-validator'

export class UpdateCompletedDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  completedQuantity!: number
}
