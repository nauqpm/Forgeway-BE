import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { SPACE_ROLES } from '@/common/constants/space-role.constants';

export class CreateInviteDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email của người được mời',
  })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiPropertyOptional({
    enum: SPACE_ROLES,
    description: 'Vai trò trong workspace',
    default: SPACE_ROLES.MEMBER,
  })
  @IsEnum(SPACE_ROLES, {
    message: `role phải là một trong: ${Object.values(SPACE_ROLES).join(', ')}`,
  })
  @IsOptional()
  role?: string;
}
