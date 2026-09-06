import { Type } from 'class-transformer'
import { IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class CreateMachineDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string

  @Type(() => Number)
  @IsInt()
  processId!: number
}
