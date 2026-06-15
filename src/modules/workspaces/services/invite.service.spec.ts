import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { InviteService } from './invite.service';
import { InviteRepository } from '../repositories/invite.repository';
import { WorkspacesRepository } from '../repositories/workspaces.repository';
import { UsersService } from '@/modules/users/services/users.service';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { INVITE_STATUS } from '../schemas/invite.schema';
import { SPACE_ROLES } from '@/common/constants/space-role.constants';
import { NotificationsService } from '@/modules/notifications/services/notifications.service';

const mockWorkspace = {
  _id: new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
  name: 'Test Workspace',
  key: 'TEST',
  ownerId: new Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),
  members: [
    {
      userId: new Types.ObjectId('cccccccccccccccccccccccc'),
      role: SPACE_ROLES.MEMBER,
    },
  ],
};

const mockExistingUser = {
  _id: new Types.ObjectId('dddddddddddddddddddddddd'),
  id: 'dddddddddddddddddddddddd',
  email: 'existing@example.com',
  fullName: 'Existing User',
};

describe('InviteService', () => {
  let service: InviteService;
  let inviteRepo: jest.Mocked<InviteRepository>;
  let workspacesRepo: jest.Mocked<WorkspacesRepository>;
  let usersService: jest.Mocked<UsersService>;
  let mailerService: jest.Mocked<MailerService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InviteService,
        {
          provide: InviteRepository,
          useValue: {
            create: jest.fn(),
            findPendingByWorkspace: jest.fn(),
            findPendingByEmailAndWorkspace: jest.fn(),
            findByToken: jest.fn(),
            findPendingValidByEmail: jest.fn(),
            findById: jest.fn(),
            findByIdWithInviter: jest.fn(),
            updateStatus: jest.fn(),
            addAcceptedBy: jest.fn(),
          },
        },
        {
          provide: WorkspacesRepository,
          useValue: {
            findById: jest.fn(),
            addMember: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: { findByEmail: jest.fn() },
        },
        {
          provide: MailerService,
          useValue: { sendMail: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('http://localhost:3000') },
        },
        {
          provide: NotificationsService,
          useValue: {
            notifyWorkspaceInvited: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<InviteService>(InviteService);
    inviteRepo = module.get(InviteRepository);
    workspacesRepo = module.get(WorkspacesRepository);
    usersService = module.get(UsersService);
    mailerService = module.get(MailerService);
  });

  describe('createInvite', () => {
    const workspaceId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const invitedByUserId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const dto = { email: 'new@example.com', role: SPACE_ROLES.MEMBER };

    it('throws NotFoundException when workspace not found', async () => {
      workspacesRepo.findById.mockResolvedValue(null);
      await expect(
        service.createInvite(workspaceId, invitedByUserId, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when invitee is already a member', async () => {
      workspacesRepo.findById.mockResolvedValue({
        ...mockWorkspace,
        members: [
          {
            userId: new Types.ObjectId('dddddddddddddddddddddddd'),
            role: SPACE_ROLES.MEMBER,
          },
        ],
      } as any);
      usersService.findByEmail.mockResolvedValue(mockExistingUser as any);
      inviteRepo.findPendingByEmailAndWorkspace.mockResolvedValue(null);

      await expect(
        service.createInvite(workspaceId, invitedByUserId, {
          email: 'existing@example.com',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when pending invite already exists for email', async () => {
      workspacesRepo.findById.mockResolvedValue(mockWorkspace as any);
      usersService.findByEmail.mockResolvedValue(null);
      inviteRepo.findPendingByEmailAndWorkspace.mockResolvedValue({
        _id: 'existingInvite',
      } as any);

      await expect(
        service.createInvite(workspaceId, invitedByUserId, dto),
      ).rejects.toThrow(ConflictException);
    });

    it('creates invite record and sends email for valid new invite', async () => {
      workspacesRepo.findById.mockResolvedValue(mockWorkspace as any);
      usersService.findByEmail.mockResolvedValue(null);
      inviteRepo.findPendingByEmailAndWorkspace.mockResolvedValue(null);
      inviteRepo.create.mockResolvedValue({
        _id: 'inviteObjectId',
        token: 'mock-token',
        workspaceId: mockWorkspace._id,
        invitedEmail: dto.email.toLowerCase(),
        invitedBy: new Types.ObjectId(invitedByUserId),
        role: dto.role,
        status: INVITE_STATUS.PENDING,
      } as any);

      const result = await service.createInvite(
        workspaceId,
        invitedByUserId,
        dto,
      );

      expect(inviteRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          invitedEmail: dto.email.toLowerCase(),
          role: dto.role,
          status: INVITE_STATUS.PENDING,
        }),
      );
      expect(mailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: dto.email.toLowerCase() }),
      );
      expect(result).toBeDefined();
    });

    it('still returns invite when email delivery fails', async () => {
      workspacesRepo.findById.mockResolvedValue(mockWorkspace as any);
      usersService.findByEmail.mockResolvedValue(null);
      inviteRepo.findPendingByEmailAndWorkspace.mockResolvedValue(null);
      inviteRepo.create.mockResolvedValue({
        _id: 'inviteObjectId',
        token: 'mock-token',
        workspaceId: mockWorkspace._id,
        invitedEmail: dto.email.toLowerCase(),
        invitedBy: new Types.ObjectId(invitedByUserId),
        role: dto.role,
        status: INVITE_STATUS.PENDING,
      } as any);
      mailerService.sendMail.mockRejectedValue(new Error('SMTP error'));

      await expect(
        service.createInvite(workspaceId, invitedByUserId, dto),
      ).resolves.toBeDefined();
    });
  });

  describe('createInviteLink', () => {
    const workspaceId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const invitedByUserId = 'bbbbbbbbbbbbbbbbbbbbbbbb';

    it('creates a multi-use invite link that expires in 10 minutes', async () => {
      const before = Date.now();
      workspacesRepo.findById.mockResolvedValue(mockWorkspace as any);
      inviteRepo.create.mockImplementation(
        async data =>
          ({
            _id: 'linkInviteId',
            token: 'mock-link-token',
            ...data,
          }) as any,
      );

      const result = await service.createInviteLink(
        workspaceId,
        invitedByUserId,
        {
          role: SPACE_ROLES.VIEWER,
        },
      );

      const createdData = inviteRepo.create.mock.calls[0][0] as any;
      expect(createdData).toEqual(
        expect.objectContaining({
          workspaceId: mockWorkspace._id,
          invitedEmail: null,
          invitedBy: invitedByUserId,
          role: SPACE_ROLES.VIEWER,
          type: 'link',
          status: INVITE_STATUS.PENDING,
          acceptedBy: [],
        }),
      );
      expect(createdData.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + 10 * 60 * 1000 - 1000,
      );
      expect(createdData.expiresAt.getTime()).toBeLessThanOrEqual(
        before + 10 * 60 * 1000 + 1000,
      );
      expect((result as any).inviteUrl).toBe(
        `http://localhost:3000/invites/accept/${createdData.token}`,
      );
      expect(mailerService.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('getInvites', () => {
    it('returns pending invites for workspace', async () => {
      const mockInvites = [
        { invitedEmail: 'a@b.com', status: INVITE_STATUS.PENDING },
      ];
      inviteRepo.findPendingByWorkspace.mockResolvedValue(mockInvites as any);

      const result = await service.getInvites('aaaaaaaaaaaaaaaaaaaaaaaa');

      expect(result).toEqual(mockInvites);
      expect(inviteRepo.findPendingByWorkspace).toHaveBeenCalledWith(
        'aaaaaaaaaaaaaaaaaaaaaaaa',
      );
    });
  });

  describe('cancelInvite', () => {
    it('throws NotFoundException when invite not found', async () => {
      inviteRepo.findById.mockResolvedValue(null);
      await expect(
        service.cancelInvite('workspaceId', 'inviteId'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when invite belongs to different workspace', async () => {
      inviteRepo.findById.mockResolvedValue({
        _id: 'inviteId',
        workspaceId: new Types.ObjectId('ffffffffffffffffffffffff'),
        status: INVITE_STATUS.PENDING,
      } as any);

      await expect(
        service.cancelInvite('aaaaaaaaaaaaaaaaaaaaaaaa', 'inviteId'),
      ).rejects.toThrow(BadRequestException);
    });

    it('marks invite as expired', async () => {
      inviteRepo.findById.mockResolvedValue({
        _id: 'inviteId',
        workspaceId: new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
        status: INVITE_STATUS.PENDING,
      } as any);
      inviteRepo.updateStatus.mockResolvedValue({
        status: INVITE_STATUS.EXPIRED,
      } as any);

      await service.cancelInvite('aaaaaaaaaaaaaaaaaaaaaaaa', 'inviteId');

      expect(inviteRepo.updateStatus).toHaveBeenCalledWith(
        'inviteId',
        INVITE_STATUS.EXPIRED,
      );
    });
  });

  describe('acceptInvite', () => {
    const mockToken = 'valid-uuid-token';
    const userId = 'eeeeeeeeeeeeeeeeeeeeeeee';
    const userEmail = 'invitee@example.com';
    const mockInvite = {
      _id: 'inviteObjectId',
      token: mockToken,
      workspaceId: new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
      invitedEmail: 'invitee@example.com',
      role: SPACE_ROLES.MEMBER,
      status: INVITE_STATUS.PENDING,
      expiresAt: new Date(Date.now() + 86400000),
    };

    it('throws NotFoundException when token not found', async () => {
      inviteRepo.findByToken.mockResolvedValue(null);
      await expect(
        service.acceptInvite(mockToken, userId, userEmail),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws clear GoneException when invite is expired by date', async () => {
      inviteRepo.findByToken.mockResolvedValue({
        ...mockInvite,
        expiresAt: new Date(Date.now() - 86400000),
      } as any);
      await expect(
        service.acceptInvite(mockToken, userId, userEmail),
      ).rejects.toThrow('This invitation has expired.');
    });

    it('throws clear GoneException when invite has already been accepted', async () => {
      inviteRepo.findByToken.mockResolvedValue({
        ...mockInvite,
        status: INVITE_STATUS.ACCEPTED,
      } as any);
      await expect(
        service.acceptInvite(mockToken, userId, userEmail),
      ).rejects.toThrow('This invitation has already been accepted.');
    });

    it('prefers accepted message over expired message when accepted invite is also past expiry', async () => {
      inviteRepo.findByToken.mockResolvedValue({
        ...mockInvite,
        status: INVITE_STATUS.ACCEPTED,
        expiresAt: new Date(Date.now() - 86400000),
      } as any);
      await expect(
        service.acceptInvite(mockToken, userId, userEmail),
      ).rejects.toThrow('This invitation has already been accepted.');
    });

    it('throws ForbiddenException when authenticated user email does not match invite', async () => {
      inviteRepo.findByToken.mockResolvedValue(mockInvite as any);
      await expect(
        service.acceptInvite(mockToken, userId, 'wrong@example.com'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when user is already a member', async () => {
      inviteRepo.findByToken.mockResolvedValue(mockInvite as any);
      workspacesRepo.findById.mockResolvedValue({
        ...mockWorkspace,
        members: [
          {
            userId: new Types.ObjectId('eeeeeeeeeeeeeeeeeeeeeeee'),
            role: SPACE_ROLES.MEMBER,
          },
        ],
      } as any);
      await expect(
        service.acceptInvite(mockToken, userId, userEmail),
      ).rejects.toThrow(ConflictException);
    });

    it('adds user to workspace and marks invite accepted', async () => {
      inviteRepo.findByToken.mockResolvedValue(mockInvite as any);
      workspacesRepo.findById.mockResolvedValue({
        ...mockWorkspace,
        members: [],
      } as any);
      workspacesRepo.addMember.mockResolvedValue({} as any);
      inviteRepo.updateStatus.mockResolvedValue({} as any);

      await service.acceptInvite(mockToken, userId, userEmail);

      expect(workspacesRepo.addMember).toHaveBeenCalledWith(
        mockInvite.workspaceId.toString(),
        userId,
        mockInvite.role,
      );
      expect(inviteRepo.updateStatus).toHaveBeenCalledWith(
        'inviteObjectId',
        INVITE_STATUS.ACCEPTED,
      );
    });

    it('accepts link invite for any authenticated email and keeps token pending for reuse', async () => {
      const linkInvite = {
        ...mockInvite,
        type: 'link',
        invitedEmail: null,
        acceptedBy: [],
      };
      inviteRepo.findByToken.mockResolvedValue(linkInvite as any);
      workspacesRepo.findById.mockResolvedValue({
        ...mockWorkspace,
        members: [],
      } as any);
      workspacesRepo.addMember.mockResolvedValue({} as any);
      inviteRepo.addAcceptedBy.mockResolvedValue({} as any);

      await service.acceptInvite(mockToken, userId, 'anyone@example.com');

      expect(workspacesRepo.addMember).toHaveBeenCalledWith(
        linkInvite.workspaceId.toString(),
        userId,
        linkInvite.role,
      );
      expect(inviteRepo.addAcceptedBy).toHaveBeenCalledWith(
        'inviteObjectId',
        userId,
      );
      expect(inviteRepo.updateStatus).not.toHaveBeenCalledWith(
        'inviteObjectId',
        INVITE_STATUS.ACCEPTED,
      );
    });
  });

  describe('getInviteByToken', () => {
    it('throws NotFoundException when token not found', async () => {
      inviteRepo.findByToken.mockResolvedValue(null);
      await expect(service.getInviteByToken('bad-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns invite info with workspace name for valid token', async () => {
      inviteRepo.findByToken.mockResolvedValue({
        token: 'valid-token',
        invitedEmail: 'a@b.com',
        role: SPACE_ROLES.MEMBER,
        status: INVITE_STATUS.PENDING,
        expiresAt: new Date(Date.now() + 86400000),
        invitedBy: { fullName: 'Admin', avatar: null },
        workspaceId: new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
      } as any);
      workspacesRepo.findById.mockResolvedValue(mockWorkspace as any);

      const result = await service.getInviteByToken('valid-token');

      expect(result.invitedEmail).toBe('a@b.com');
      expect(result.workspaceName).toBe('Test Workspace');
    });

    it('returns link invite info without invited email', async () => {
      inviteRepo.findByToken.mockResolvedValue({
        token: 'link-token',
        invitedEmail: null,
        type: 'link',
        role: SPACE_ROLES.VIEWER,
        status: INVITE_STATUS.PENDING,
        expiresAt: new Date(Date.now() + 600000),
        invitedBy: { fullName: 'Admin', avatar: null },
        workspaceId: new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
      } as any);
      workspacesRepo.findById.mockResolvedValue(mockWorkspace as any);

      const result = await service.getInviteByToken('link-token');

      expect(result.type).toBe('link');
      expect(result.invitedEmail).toBeNull();
      expect(result.workspaceName).toBe('Test Workspace');
    });
  });

  describe('getInviteByIdForUser', () => {
    const inviteId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const userId = 'eeeeeeeeeeeeeeeeeeeeeeee';
    const userEmail = 'invitee@example.com';

    it('throws ForbiddenException when authenticated user email does not match invite', async () => {
      inviteRepo.findByIdWithInviter.mockResolvedValue({
        _id: inviteId,
        workspaceId: new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
        invitedEmail: 'other@example.com',
        role: SPACE_ROLES.MEMBER,
        status: INVITE_STATUS.PENDING,
      } as any);

      await expect(
        service.getInviteByIdForUser(inviteId, userId, userEmail),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns invite status without exposing token for matching authenticated user', async () => {
      inviteRepo.findByIdWithInviter.mockResolvedValue({
        _id: inviteId,
        token: 'secret-token',
        workspaceId: mockWorkspace._id,
        invitedEmail: userEmail,
        invitedBy: {
          fullName: 'Admin',
          email: 'admin@example.com',
          avatar: null,
        },
        role: SPACE_ROLES.MEMBER,
        status: INVITE_STATUS.PENDING,
        expiresAt: null,
      } as any);
      workspacesRepo.findById.mockResolvedValue(mockWorkspace as any);

      const result = await service.getInviteByIdForUser(
        inviteId,
        userId,
        userEmail,
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: inviteId,
          workspaceId: mockWorkspace._id.toString(),
          workspaceName: mockWorkspace.name,
          workspaceKey: mockWorkspace.key,
          invitedEmail: userEmail,
          status: INVITE_STATUS.PENDING,
        }),
      );
      expect(result).not.toHaveProperty('token');
    });
  });
  describe('acceptInviteByIdForUser', () => {
    const inviteId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const userId = 'eeeeeeeeeeeeeeeeeeeeeeee';
    const userEmail = 'invitee@example.com';
    const mockInvite = {
      _id: inviteId,
      workspaceId: mockWorkspace._id,
      invitedEmail: userEmail,
      role: SPACE_ROLES.MEMBER,
      status: INVITE_STATUS.PENDING,
      expiresAt: null,
    };

    it('adds the authenticated invite recipient to the workspace and marks invite accepted', async () => {
      inviteRepo.findById.mockResolvedValue(mockInvite as any);
      workspacesRepo.findById.mockResolvedValue({
        ...mockWorkspace,
        members: [],
      } as any);
      workspacesRepo.addMember.mockResolvedValue({} as any);
      inviteRepo.updateStatus.mockResolvedValue({
        status: INVITE_STATUS.ACCEPTED,
      } as any);

      await service.acceptInviteByIdForUser(inviteId, userId, userEmail);

      expect(workspacesRepo.addMember).toHaveBeenCalledWith(
        mockWorkspace._id.toString(),
        userId,
        SPACE_ROLES.MEMBER,
      );
      expect(inviteRepo.updateStatus).toHaveBeenCalledWith(
        inviteId,
        INVITE_STATUS.ACCEPTED,
      );
    });

    it('throws ForbiddenException when authenticated user email does not match invite', async () => {
      inviteRepo.findById.mockResolvedValue({
        ...mockInvite,
        invitedEmail: 'other@example.com',
      } as any);

      await expect(
        service.acceptInviteByIdForUser(inviteId, userId, userEmail),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('declineInviteByIdForUser', () => {
    const inviteId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const userId = 'eeeeeeeeeeeeeeeeeeeeeeee';
    const userEmail = 'invitee@example.com';

    it('marks authenticated invite as declined', async () => {
      inviteRepo.findById.mockResolvedValue({
        _id: inviteId,
        workspaceId: mockWorkspace._id,
        invitedEmail: userEmail,
        role: SPACE_ROLES.MEMBER,
        status: INVITE_STATUS.PENDING,
        expiresAt: null,
      } as any);
      inviteRepo.updateStatus.mockResolvedValue({
        status: INVITE_STATUS.DECLINED,
      } as any);

      await service.declineInviteByIdForUser(inviteId, userId, userEmail);

      expect(inviteRepo.updateStatus).toHaveBeenCalledWith(
        inviteId,
        INVITE_STATUS.DECLINED,
      );
      expect(workspacesRepo.addMember).not.toHaveBeenCalled();
    });
  });
  describe('processPostRegisterInvites', () => {
    it('auto-joins all pending valid workspaces for email', async () => {
      const email = 'new@example.com';
      const newUserId = 'ffffffffffffffffffffffff';
      const pendingInvites = [
        {
          _id: 'inv1',
          workspaceId: new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
          role: SPACE_ROLES.MEMBER,
        },
        {
          _id: 'inv2',
          workspaceId: new Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),
          role: SPACE_ROLES.VIEWER,
        },
      ];
      inviteRepo.findPendingValidByEmail.mockResolvedValue(
        pendingInvites as any,
      );
      workspacesRepo.addMember.mockResolvedValue({} as any);
      inviteRepo.updateStatus.mockResolvedValue({} as any);

      await service.processPostRegisterInvites(email, newUserId);

      expect(workspacesRepo.addMember).toHaveBeenCalledTimes(2);
      expect(inviteRepo.updateStatus).toHaveBeenCalledWith(
        'inv1',
        INVITE_STATUS.ACCEPTED,
      );
      expect(inviteRepo.updateStatus).toHaveBeenCalledWith(
        'inv2',
        INVITE_STATUS.ACCEPTED,
      );
    });

    it('is a no-op when no pending invites exist for email', async () => {
      inviteRepo.findPendingValidByEmail.mockResolvedValue([]);

      await service.processPostRegisterInvites('nobody@example.com', 'uid');

      expect(workspacesRepo.addMember).not.toHaveBeenCalled();
    });
  });
});
