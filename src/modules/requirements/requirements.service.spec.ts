import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { RequirementsService } from './requirements.service';

describe('RequirementsService', () => {
  const workspaceA = new Types.ObjectId().toString();
  const workspaceB = new Types.ObjectId().toString();
  const requirementId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const requirement = {
    _id: requirementId,
    workspaceId: workspaceA,
    key: 'REQ-1',
    title: 'Capture user need',
    body: 'A user needs a workspace-scoped requirement.',
    sourceType: 'jira',
    sourceRef: 'PROJ-123',
    sourceMetadata: { importedBy: 'sync' },
    status: 'active',
  };
  const model = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  let service: RequirementsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RequirementsService(model as any);
  });

  it('creates a workspace-scoped requirement while preserving normalized source provenance', async () => {
    model.create.mockResolvedValue(requirement);

    await expect(
      service.create(
        workspaceA,
        {
          key: ' REQ-1 ',
          title: ' Capture user need ',
          body: ' A user needs a workspace-scoped requirement. ',
          sourceType: ' jira ',
          sourceRef: ' PROJ-123 ',
          sourceMetadata: { importedBy: 'sync' },
        },
        userId,
      ),
    ).resolves.toEqual(requirement);

    expect(model.create).toHaveBeenCalledWith({
      workspaceId: workspaceA,
      key: 'REQ-1',
      title: 'Capture user need',
      body: 'A user needs a workspace-scoped requirement.',
      sourceType: 'jira',
      sourceRef: 'PROJ-123',
      sourceMetadata: { importedBy: 'sync' },
      status: 'active',
      createdBy: userId,
    });
  });

  it('translates duplicate workspace keys into a safe conflict response', async () => {
    model.create.mockRejectedValue({ code: 11000 });

    await expect(
      service.create(
        workspaceA,
        {
          key: 'REQ-1',
          title: 'Capture user need',
          body: 'A user needs a workspace-scoped requirement.',
          sourceType: 'manual',
        },
        userId,
      ),
    ).rejects.toEqual(
      new ConflictException('Requirement key already exists in this workspace'),
    );
  });

  it('does not fetch a requirement through another workspace', async () => {
    model.findOne.mockResolvedValue(null);

    await expect(
      service.findById(workspaceB, requirementId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(model.findOne).toHaveBeenCalledWith({
      _id: requirementId,
      workspaceId: workspaceB,
    });
  });

  it('soft-archives a requirement and leaves the archived record readable', async () => {
    const archived = {
      ...requirement,
      status: 'archived',
      archivedAt: new Date(),
      archivedBy: userId,
    };
    model.findOneAndUpdate.mockResolvedValue(archived);
    model.findOne.mockResolvedValue(archived);

    await expect(
      service.archive(workspaceA, requirementId, userId),
    ).resolves.toEqual(archived);
    await expect(service.findById(workspaceA, requirementId)).resolves.toEqual(
      archived,
    );
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: requirementId, workspaceId: workspaceA, status: 'active' },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'archived',
          archivedBy: userId,
        }),
      }),
      { new: true },
    );
  });
});
