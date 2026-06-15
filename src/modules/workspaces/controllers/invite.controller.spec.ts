import { Test, TestingModule } from '@nestjs/testing';
import { InviteController } from './invite.controller';
import { InviteService } from '../services/invite.service';
import { SPACE_ROLES } from '@/common/constants/space-role.constants';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { ScopedRoleGuard } from '@/common/guards/scoped-role.guard';

describe('InviteController', () => {
  let controller: InviteController;
  let service: jest.Mocked<InviteService>;

  const mockUser = {
    userId: 'useridabc',
    email: 'admin@example.com',
    role: 'user',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InviteController],
      providers: [
        {
          provide: InviteService,
          useValue: {
            createInvite: jest.fn(),
            createInviteLink: jest.fn(),
            getInvites: jest.fn(),
            cancelInvite: jest.fn(),
            getInviteByToken: jest.fn(),
            getInviteByIdForUser: jest.fn(),
            acceptInviteByIdForUser: jest.fn(),
            declineInviteByIdForUser: jest.fn(),
            acceptInvite: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ScopedRoleGuard('workspace', SPACE_ROLES.WORKSPACE_ADMIN))
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InviteController>(InviteController);
    service = module.get(InviteService);
  });

  it('createInvite calls service with workspaceId, userId, dto', async () => {
    const dto = { email: 'new@example.com', role: SPACE_ROLES.MEMBER };
    service.createInvite.mockResolvedValue({ token: 'abc' } as any);

    const result = await controller.createInvite(
      'workspaceId',
      mockUser as any,
      dto,
    );

    expect(service.createInvite).toHaveBeenCalledWith(
      'workspaceId',
      mockUser.userId,
      dto,
    );
    expect(result).toEqual({ token: 'abc' });
  });

  it('createInviteLink calls service with workspaceId, userId, dto', async () => {
    const dto = { role: SPACE_ROLES.VIEWER };
    service.createInviteLink.mockResolvedValue({ token: 'link-token' } as any);

    const result = await controller.createInviteLink(
      'workspaceId',
      mockUser as any,
      dto,
    );

    expect(service.createInviteLink).toHaveBeenCalledWith(
      'workspaceId',
      mockUser.userId,
      dto,
    );
    expect(result).toEqual({ token: 'link-token' });
  });

  it('getInvites calls service with workspaceId', async () => {
    service.getInvites.mockResolvedValue([]);

    await controller.getInvites('workspaceId');

    expect(service.getInvites).toHaveBeenCalledWith('workspaceId');
  });

  it('cancelInvite calls service with workspaceId and inviteId', async () => {
    service.cancelInvite.mockResolvedValue(undefined);

    await controller.cancelInvite('workspaceId', 'inviteId');

    expect(service.cancelInvite).toHaveBeenCalledWith(
      'workspaceId',
      'inviteId',
    );
  });

  it('getInviteById calls service with inviteId, userId, userEmail', async () => {
    service.getInviteByIdForUser.mockResolvedValue({
      workspaceName: 'Test',
    } as any);

    await controller.getInviteById('inviteId', mockUser as any);

    expect(service.getInviteByIdForUser).toHaveBeenCalledWith(
      'inviteId',
      mockUser.userId,
      mockUser.email,
    );
  });
  it('acceptInviteById calls service with inviteId, userId, userEmail', async () => {
    service.acceptInviteByIdForUser.mockResolvedValue(undefined);

    await controller.acceptInviteById('inviteId', mockUser as any);

    expect(service.acceptInviteByIdForUser).toHaveBeenCalledWith(
      'inviteId',
      mockUser.userId,
      mockUser.email,
    );
  });

  it('declineInviteById calls service with inviteId, userId, userEmail', async () => {
    service.declineInviteByIdForUser.mockResolvedValue(undefined);

    await controller.declineInviteById('inviteId', mockUser as any);

    expect(service.declineInviteByIdForUser).toHaveBeenCalledWith(
      'inviteId',
      mockUser.userId,
      mockUser.email,
    );
  });
  it('getInviteByToken calls service with token', async () => {
    service.getInviteByToken.mockResolvedValue({
      workspaceName: 'Test',
    } as any);

    await controller.getInviteByToken('some-token');

    expect(service.getInviteByToken).toHaveBeenCalledWith('some-token');
  });

  it('acceptInvite calls service with token, userId, userEmail', async () => {
    service.acceptInvite.mockResolvedValue(undefined);

    await controller.acceptInvite('some-token', mockUser as any);

    expect(service.acceptInvite).toHaveBeenCalledWith(
      'some-token',
      mockUser.userId,
      mockUser.email,
    );
  });
});
