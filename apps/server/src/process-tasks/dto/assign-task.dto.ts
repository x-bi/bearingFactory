import { Type } from 'class-transformer'
import { IsInt } from 'class-validator'

export class AssignTaskDto {
  @Type(() => Number)
  @IsInt()
  workstationId!: number
}
