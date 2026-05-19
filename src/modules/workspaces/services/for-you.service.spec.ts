import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';

import { SPACE_ROLES } from '../../../common/constants/space-role.constants';
import { WorkspacesRepository } from '../repositories/workspaces.repository';
import { WorkspaceDocument } from '../schemas/workspace.schema';
import { ForYouService } from './for-you.service';

describe('ForYouService', () => {
  let service: ForYouService;
  let repository: jest.Mocked<Pick<WorkspacesRepository, 'findActiveForUserOverview'>>;

  beforeEach(async () => {
    repository = {
      findActiveForUserOverview: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ForYouService,
        {
          provide: WorkspacesRepository,
          useValue: repository,
        },
      ],
    }).compile();

    service = moduleRef.get(ForYouService);
  });

  it('rejects empty user IDs', async () => {
    await expect(service.getForYouWorkspaces('  ')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(repository.findActiveForUserOverview).not.toHaveBeenCalled();
  });

  it('returns an empty workspace list', async () => {
    repository.findActiveForUserOverview.mockResolvedValue([]);

    const result = await service.getForYouWorkspaces(new Types.ObjectId().toString());

    expect(result).toEqual({ success: true, workspaces: [] });
  });

  it('maps owned and joined workspaces to For You DTOs', async () => {
    const userId = new Types.ObjectId();
    const ownerWorkspaceId = new Types.ObjectId();
    const memberWorkspaceId = new Types.ObjectId();
    const otherOwnerId = new Types.ObjectId();

    repository.findActiveForUserOverview.mockResolvedValue([
      createWorkspaceDocument({
        _id: ownerWorkspaceId,
        ownerId: userId,
        members: [{ userId, role: SPACE_ROLES.SPACE_ADMIN }],
        name: 'Owned Space',
        slug: 'owned-space',
        key: 'OWN',
      }),
      createWorkspaceDocument({
        _id: memberWorkspaceId,
        ownerId: otherOwnerId,
        members: [{ userId, role: SPACE_ROLES.MEMBER }],
        name: 'Joined Space',
        slug: 'joined-space',
        key: 'JOIN',
      }),
    ]);

    const result = await service.getForYouWorkspaces(userId.toString());

    expect(result.workspaces).toEqual([
      expect.objectContaining({
        id: ownerWorkspaceId.toString(),
        name: 'Owned Space',
        role: SPACE_ROLES.SPACE_ADMIN,
        relationship: 'owner',
        ownershipLabel: 'Sở hữu',
      }),
      expect.objectContaining({
        id: memberWorkspaceId.toString(),
        name: 'Joined Space',
        role: SPACE_ROLES.MEMBER,
        relationship: 'member',
        ownershipLabel: 'Tham gia',
      }),
    ]);
  });
});

function createWorkspaceDocument(overrides: {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  members: Array<{ userId: Types.ObjectId; role: string }>;
  name: string;
  slug: string;
  key: string;
}): WorkspaceDocument {
  return {
    _id: overrides._id,
    name: overrides.name,
    description: undefined,
    slug: overrides.slug,
    key: overrides.key,
    type: 'kanban',
    ownerId: overrides.ownerId,
    members: overrides.members,
    settings: {},
    status: 'active',
    createdAt: new Date('2026-05-19T08:00:00.000Z'),
    updatedAt: new Date('2026-05-19T08:30:00.000Z'),
  } as WorkspaceDocument;
}
