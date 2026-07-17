import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { SPACE_ROLES } from '@/common/constants/space-role.constants';
import {
  DEFAULT_WORKSPACE_AVATAR,
  WORKSPACE_SAMPLE_AVATARS,
  isWorkspaceSampleAvatar,
  pickRandomWorkspaceAvatar,
} from '@/modules/workspaces/constants/workspace-sample-avatars.constant';
import { WorkspacesService } from '@/modules/workspaces/services/workspaces.service';

const ownerId = new Types.ObjectId().toString();
const workspaceId = new Types.ObjectId().toString();

const buildWorkspace = (overrides: Record<string, any> = {}) => ({
  _id: new Types.ObjectId(workspaceId),
  name: 'Avatar Workspace',
  description: '',
  slug: 'avatar-workspace',
  key: 'AVATAR',
  type: 'kanban',
  access: 'public',
  status: 'active',
  ownerId: new Types.ObjectId(ownerId),
  members: [
    { userId: new Types.ObjectId(ownerId), role: SPACE_ROLES.WORKSPACE_ADMIN },
  ],
  settings: {},
  ...overrides,
});

const createService = () => {
  const repository = {
    create: jest.fn(),
    findById: jest.fn(),
    findByUserId: jest.fn(),
    findAnyBySlug: jest.fn(),
    findAnyByKey: jest.fn(),
    update: jest.fn(),
  };
  const workflowsService = { createDefaultWorkflow: jest.fn() };
  const kanbanService = { createDefaultBoard: jest.fn() };
  const scrumService = {};
  const workspaceKeyService = {
    generateUniqueSlug: jest.fn(async () => 'avatar-workspace'),
    generateUniqueKey: jest.fn(async () => 'AVATAR'),
  };
  const eventPublisher = {
    publishCreated: jest.fn(),
    publishUpdated: jest.fn(),
  };
  const countModel = { countDocuments: jest.fn(async () => 0) };

  const service = new WorkspacesService(
    repository as any,
    workflowsService as any,
    kanbanService as any,
    scrumService as any,
    workspaceKeyService as any,
    eventPublisher as any,
    countModel as any,
    countModel as any,
    countModel as any,
    {} as any,
    { createWorkspaceChannel: jest.fn().mockResolvedValue({}) } as any,
    { mode: jest.fn().mockReturnValue('legacy') } as any,
    { createWorkspace: repository.create } as any,
  );

  return {
    eventPublisher,
    kanbanService,
    repository,
    service,
    workflowsService,
  };
};

describe('workspace sample avatars', () => {
  it('exposes 25 Cloudinary workspace avatar samples from the sdlc-platform folder', () => {
    expect(WORKSPACE_SAMPLE_AVATARS).toHaveLength(25);
    expect(WORKSPACE_SAMPLE_AVATARS[0]).toEqual(
      expect.objectContaining({
        id: 'viewavatar',
        publicId: 'sdlc-platform/sample avater workspace/viewavatar',
      }),
    );
    expect(
      WORKSPACE_SAMPLE_AVATARS.every(avatar =>
        avatar.url.includes('/sdlc-platform/sample%20avater%20workspace/'),
      ),
    ).toBe(true);
  });

  it('picks a random avatar from the sample list', () => {
    const avatar = pickRandomWorkspaceAvatar(() => 0.999);

    expect(avatar).toBe(WORKSPACE_SAMPLE_AVATARS[24].url);
    expect(isWorkspaceSampleAvatar(avatar)).toBe(true);
  });
});

describe('WorkspacesService avatar handling', () => {
  it('assigns a default sample avatar when creating a workspace without avatar', async () => {
    const { repository, service } = createService();
    repository.findAnyBySlug.mockResolvedValue(null);
    repository.create.mockImplementation(async data => buildWorkspace(data));

    await service.create(ownerId, { name: 'Avatar Workspace' });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        avatar: expect.stringContaining(
          '/sdlc-platform/sample%20avater%20workspace/',
        ),
      }),
    );
  });

  it('keeps a selected sample avatar when creating a workspace', async () => {
    const selectedAvatar = WORKSPACE_SAMPLE_AVATARS[3].url;
    const { repository, service } = createService();
    repository.findAnyBySlug.mockResolvedValue(null);
    repository.create.mockImplementation(async data => buildWorkspace(data));

    await service.create(ownerId, {
      name: 'Avatar Workspace',
      avatar: selectedAvatar,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ avatar: selectedAvatar }),
    );
  });

  it('updates workspace avatar when the value is one of the samples', async () => {
    const selectedAvatar = WORKSPACE_SAMPLE_AVATARS[7].url;
    const workspace = buildWorkspace();
    const { repository, service } = createService();
    repository.findById.mockResolvedValue(workspace);
    repository.update.mockResolvedValue({
      ...workspace,
      avatar: selectedAvatar,
    });

    await service.update(workspaceId, { avatar: selectedAvatar }, ownerId);

    expect(repository.update).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({ avatar: selectedAvatar }),
    );
  });

  it('returns the default sample avatar when a stored workspace has no avatar', async () => {
    const workspace = buildWorkspace({ avatar: undefined });
    const { repository, service } = createService();
    repository.findById.mockResolvedValue(workspace);

    const result = await service.findById(workspaceId);

    expect(result.avatar).toBe(DEFAULT_WORKSPACE_AVATAR);
  });

  it('returns the default sample avatar in workspace lists when stored workspaces have no avatar', async () => {
    const workspace = buildWorkspace({ avatar: undefined });
    const { repository, service } = createService();
    repository.findByUserId.mockResolvedValue([workspace]);

    const result = await service.findByUserId(ownerId);

    expect(result[0].avatar).toBe(DEFAULT_WORKSPACE_AVATAR);
  });

  it('rejects workspace avatar values outside the sample list', async () => {
    const workspace = buildWorkspace();
    const { repository, service } = createService();
    repository.findById.mockResolvedValue(workspace);

    await expect(
      service.update(
        workspaceId,
        { avatar: 'https://example.com/not-allowed.png' } as any,
        ownerId,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });
});
