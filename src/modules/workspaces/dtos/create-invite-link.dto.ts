import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { SPACE_ROLES } from '@/common/constants/space-role.constants';

export class CreateInviteLinkDto {
  @ApiProperty({ enum: SPACE_ROLES, description: 'Vai tro trong workspace' })
  @IsNotEmpty({ message: 'role la bat buoc' })
  @IsEnum(SPACE_ROLES, {
    message: `role phai la mot trong: ${Object.values(SPACE_ROLES).join(', ')}`,
  })
  role!: string;
}
