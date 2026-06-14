import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class SwitchAccountDto {
  @ApiProperty({ description: 'Mongo ObjectId of the account to switch into' })
  @IsMongoId()
  accountId!: string;
}
