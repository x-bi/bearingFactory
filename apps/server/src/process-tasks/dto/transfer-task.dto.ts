import { Type } from 'class-transformer'
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator'

export class TransferTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  requestId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number

  @Type(() => Number)
  @IsInt()
  targetWorkstationId!: number
}
