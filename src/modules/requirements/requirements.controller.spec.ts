import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { WORKSPACE_PERMISSIONS } from '../../common/constants/workspace-permissions.constants';
import { REQUIRED_WORKSPACE_PERMISSIONS_KEY } from '../../common/decorators/require-permissions.decorator';
import { WorkspaceRoleGuard } from '../../common/guards/workspace-role.guard';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirementsController } from './requirements.controller';
import { CreateRequirementDto } from './dtos/requirement.dto';
import { RequirementsService } from './requirements.service';

describe('RequirementsController', () => {
  const workspaceId = '66b9c2e8a15d8a9e9b9b4c11';
  const requirementId = '66b9c2e8a15d8a9e9b9b4c12';
  const user = { userId: '66b9c2e8a15d8a9e9b9b4c13' };
  const requirement = { id: requirementId, workspaceId, status: 'active' };
  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    archive: jest.fn(),
  };
  let controller: RequirementsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RequirementsController(
      service as unknown as RequirementsService,
    );
  });

  it('creates requirements only in the route workspace', async () => {
    service.create.mockResolvedValue(requirement);
    const dto = {
      key: 'REQ-1',
      title: 'Capture user need',
      body: 'A user needs a workspace-scoped requirement.',
      sourceType: 'manual',
    };

    await expect(
      controller.create(workspaceId, dto, user as any),
    ).resolves.toEqual(requirement);
    expect(service.create).toHaveBeenCalledWith(workspaceId, dto, user.userId);
  });

  it('reads a requirement only through the route workspace', async () => {
    service.findById.mockResolvedValue(requirement);

    await expect(
      controller.findById(workspaceId, requirementId),
    ).resolves.toEqual(requirement);
    expect(service.findById).toHaveBeenCalledWith(workspaceId, requirementId);
  });

  it('lists requirements only through the route workspace', async () => {
    service.findAll.mockResolvedValue([requirement]);

    await expect(controller.findAll(workspaceId)).resolves.toEqual([
      requirement,
    ]);
    expect(service.findAll).toHaveBeenCalledWith(workspaceId);
  });

  it('rejects empty title and body at the DTO boundary', async () => {
    const errors = await validate(
      Object.assign(new CreateRequirementDto(), {
        key: 'REQ-1',
        title: '',
        body: '',
        sourceType: 'manual',
      }),
    );

    expect(errors.map(error => error.property)).toEqual(
      expect.arrayContaining(['title', 'body']),
    );
  });

  it('rejects whitespace-only title and body at the DTO boundary', async () => {
    const dto = plainToInstance(CreateRequirementDto, {
      key: 'REQ-1',
      title: '   ',
      body: '\n\t',
      sourceType: 'manual',
    });
    const errors = await validate(dto);

    expect(dto.title).toBe('');
    expect(dto.body).toBe('');
    expect(errors.map(error => error.property)).toEqual(
      expect.arrayContaining(['title', 'body']),
    );
  });

  it('rejects whitespace-only key and source type at the DTO boundary', async () => {
    const dto = plainToInstance(CreateRequirementDto, {
      key: '   ',
      title: 'Capture user need',
      body: 'A user needs a workspace-scoped requirement.',
      sourceType: '\n\t',
    });
    const errors = await validate(dto);

    expect(dto.key).toBe('');
    expect(dto.sourceType).toBe('');
    expect(errors.map(error => error.property)).toEqual(
      expect.arrayContaining(['key', 'sourceType']),
    );
  });

  it('archives through the workspace-scoped service method', async () => {
    service.archive.mockResolvedValue({ ...requirement, status: 'archived' });

    await expect(
      controller.archive(workspaceId, requirementId, user as any),
    ).resolves.toEqual({ ...requirement, status: 'archived' });
    expect(service.archive).toHaveBeenCalledWith(
      workspaceId,
      requirementId,
      user.userId,
    );
  });
});

describe('RequirementsController security metadata', () => {
  const prototype = RequirementsController.prototype;

  it('uses JWT and workspace role guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, RequirementsController),
    ).toEqual([JwtAuthGuard, WorkspaceRoleGuard]);
  });

  it.each([
    ['create', WORKSPACE_PERMISSIONS.STORY_CREATE],
    ['findAll', WORKSPACE_PERMISSIONS.STORY_READ],
    ['findById', WORKSPACE_PERMISSIONS.STORY_READ],
    ['archive', WORKSPACE_PERMISSIONS.STORY_ARCHIVE],
  ] as const)(
    '%s requires the exact workspace permission',
    (method, permission) => {
      expect(
        Reflect.getMetadata(
          REQUIRED_WORKSPACE_PERMISSIONS_KEY,
          prototype[method],
        ),
      ).toEqual([permission]);
    },
  );

  it.each(['findById', 'archive'] as const)(
    '%s validates requirementId before it reaches the service',
    method => {
      const parameters = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        RequirementsController,
        method,
      );

      expect(Object.values(parameters)).toContainEqual(
        expect.objectContaining({
          data: 'requirementId',
          pipes: [ParseObjectIdPipe],
        }),
      );
    },
  );
});
