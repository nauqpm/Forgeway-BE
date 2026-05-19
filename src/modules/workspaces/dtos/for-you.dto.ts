import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SPACE_ROLES } from '../../../common/constants/space-role.constants';

export class ForYouWorkspaceDto {
  @ApiProperty({ example: '664a4b7b6f6e3a2a8c5d9f01', description: 'Workspace identifier' })
  id!: string;

  @ApiProperty({ example: 'AL-Tasks', description: 'Workspace display name' })
  name!: string;

  @ApiPropertyOptional({ example: 'Team task management space', description: 'Workspace description' })
  description?: string;

  @ApiProperty({ example: 'al-tasks', description: 'Workspace URL slug' })
  slug!: string;

  @ApiProperty({ example: 'ALTASKS', description: 'Short workspace key' })
  key!: string;

  @ApiProperty({ example: 'kanban', enum: ['scrum', 'kanban'], description: 'Workspace template type' })
  type!: string;

  @ApiProperty({ example: 'active', enum: ['active', 'archived'], description: 'Workspace status' })
  status!: string;

  @ApiProperty({
    example: SPACE_ROLES.SPACE_ADMIN,
    enum: Object.values(SPACE_ROLES),
    description: 'Current user role inside this workspace',
  })
  role!: string;

  @ApiProperty({ example: 'owner', enum: ['owner', 'member'], description: 'Current user relationship to workspace' })
  relationship!: 'owner' | 'member';

  @ApiProperty({ example: 'Sở hữu', enum: ['Sở hữu', 'Tham gia'], description: 'Human-readable ownership label' })
  ownershipLabel!: 'Sở hữu' | 'Tham gia';

  @ApiPropertyOptional({ example: '2026-05-19T08:00:00.000Z', description: 'Workspace creation time' })
  createdAt?: Date;

  @ApiPropertyOptional({ example: '2026-05-19T08:30:00.000Z', description: 'Workspace last update time' })
  updatedAt?: Date;
}

export class ForYouResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: [ForYouWorkspaceDto] })
  workspaces!: ForYouWorkspaceDto[];
}
