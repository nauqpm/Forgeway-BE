import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { MessagesService } from './messages.service';
import { MessagesRepository } from '../repositories/messages.repository';
import { ChannelReadMarkersRepository } from '../repositories/channel-read-markers.repository';
import { ChannelsService } from './channels.service';
import { RealtimePublisher } from '../../realtime/publishers/realtime.publisher';
import { UsersService } from '../../users/services/users.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { AttachmentService } from '../../attachments/services/attachment.service';
import { ImagesService } from '../../images/services/images.service';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { SPACE_ROLES } from '../../../common/constants/space-role.constants';

const makeId = () => new Types.ObjectId().toString();

const SENDER_ID = makeId();
const OTHER_USER_ID = makeId();
const WORKSPACE_OWNER_ID = makeId();
const WORKSPACE_ADMIN_ID = makeId();
const SUPER_ADMIN_ID = makeId();
const REGULAR_MEMBER_ID = makeId();
const OTHER_WORKSPACE_OWNER_ID = makeId();
const MESSAGE_ID = makeId();
const CHANNEL_ID = makeId();
const WORKSPACE_ID = makeId();

function buildMessage(overrides: Partial<any> = {}) {
  return {
    _id: new Types.ObjectId(MESSAGE_ID),
    senderId: new Types.ObjectId(SENDER_ID),
    channelId: new Types.ObjectId(CHANNEL_ID),
    threadParentId: null,
    attachments: [],
    toObject: jest.fn(),
    ...overrides,
  };
}

function buildChannel(type: string, workspaceId?: string) {
  return {
    _id: new Types.ObjectId(CHANNEL_ID),
    type,
    workspaceId: workspaceId ? new Types.ObjectId(workspaceId) : null,
  };
}

function buildUser(role: string) {
  return { _id: makeId(), role };
}

describe('MessagesService.deleteMessage — authorization', () => {
  let service: MessagesService;
  let mockMessagesRepository: any;
  let mockChannelsService: any;
  let mockUsersService: any;
  let mockWorkspaceMemberService: any;

  beforeEach(async () => {
    mockMessagesRepository = {
      findById: jest.fn(),
      model: {
        deleteOne: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({}),
        find: jest.fn().mockImplementation(() => {
          const result: any[] = [];
          const chain: any = Promise.resolve(result);
          chain.sort = jest.fn().mockReturnThis();
          chain.populate = jest.fn().mockReturnThis();
          chain.exec = jest.fn().mockResolvedValue(result);
          return chain;
        }),
        findOne: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnThis(),
          populate: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(null),
        }),
        updateOne: jest.fn().mockResolvedValue({}),
      },
    };

    mockChannelsService = {
      findById: jest.fn(),
      updateLastMessage: jest.fn().mockResolvedValue(undefined),
    };

    mockUsersService = {
      getUserById: jest.fn(),
    };

    mockWorkspaceMemberService = {
      getWorkspacePrivilegeInfo: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: MessagesRepository, useValue: mockMessagesRepository },
        {
          provide: ChannelReadMarkersRepository,
          useValue: { model: { findOne: jest.fn(), updateOne: jest.fn() } },
        },
        { provide: ChannelsService, useValue: mockChannelsService },
        { provide: RealtimePublisher, useValue: { emit: jest.fn() } },
        { provide: UsersService, useValue: mockUsersService },
        {
          provide: WorkspaceMemberService,
          useValue: mockWorkspaceMemberService,
        },
        { provide: NotificationsService, useValue: {} },
        {
          provide: AttachmentService,
          useValue: { deleteByUrl: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ImagesService,
          useValue: { deleteByUrl: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
  });

  describe('workspace channel', () => {
    const wsChannel = buildChannel('workspace', WORKSPACE_ID);

    it('sender tự xóa tin của mình — pass', async () => {
      mockMessagesRepository.findById.mockResolvedValue(
        buildMessage({ senderId: new Types.ObjectId(SENDER_ID) }),
      );
      mockChannelsService.findById.mockResolvedValue(wsChannel);
      mockUsersService.getUserById.mockResolvedValue(
        buildUser(GLOBAL_ROLES.USER),
      );

      await expect(
        service.deleteMessage(MESSAGE_ID, SENDER_ID),
      ).resolves.not.toThrow();
      expect(
        mockWorkspaceMemberService.getWorkspacePrivilegeInfo,
      ).not.toHaveBeenCalled();
    });

    it('super_admin xóa tin người khác — pass', async () => {
      mockMessagesRepository.findById.mockResolvedValue(
        buildMessage({ senderId: new Types.ObjectId(OTHER_USER_ID) }),
      );
      mockChannelsService.findById.mockResolvedValue(wsChannel);
      mockUsersService.getUserById.mockResolvedValue(
        buildUser(GLOBAL_ROLES.SUPER_ADMIN),
      );

      await expect(
        service.deleteMessage(MESSAGE_ID, SUPER_ADMIN_ID),
      ).resolves.not.toThrow();
      expect(
        mockWorkspaceMemberService.getWorkspacePrivilegeInfo,
      ).not.toHaveBeenCalled();
    });

    it('workspace owner xóa tin người khác (cùng workspace) — pass', async () => {
      mockMessagesRepository.findById.mockResolvedValue(
        buildMessage({ senderId: new Types.ObjectId(OTHER_USER_ID) }),
      );
      mockChannelsService.findById.mockResolvedValue(wsChannel);
      mockUsersService.getUserById.mockResolvedValue(
        buildUser(GLOBAL_ROLES.USER),
      );
      mockWorkspaceMemberService.getWorkspacePrivilegeInfo.mockResolvedValue({
        isOwner: true,
        memberRole: SPACE_ROLES.WORKSPACE_ADMIN,
      });

      await expect(
        service.deleteMessage(MESSAGE_ID, WORKSPACE_OWNER_ID),
      ).resolves.not.toThrow();
      expect(
        mockWorkspaceMemberService.getWorkspacePrivilegeInfo,
      ).toHaveBeenCalledWith(WORKSPACE_ID, WORKSPACE_OWNER_ID);
    });

    it('workspace_admin xóa tin người khác (cùng workspace) — pass', async () => {
      mockMessagesRepository.findById.mockResolvedValue(
        buildMessage({ senderId: new Types.ObjectId(OTHER_USER_ID) }),
      );
      mockChannelsService.findById.mockResolvedValue(wsChannel);
      mockUsersService.getUserById.mockResolvedValue(
        buildUser(GLOBAL_ROLES.USER),
      );
      mockWorkspaceMemberService.getWorkspacePrivilegeInfo.mockResolvedValue({
        isOwner: false,
        memberRole: SPACE_ROLES.WORKSPACE_ADMIN,
      });

      await expect(
        service.deleteMessage(MESSAGE_ID, WORKSPACE_ADMIN_ID),
      ).resolves.not.toThrow();
    });

    it('member thường xóa tin người khác — fail 403', async () => {
      mockMessagesRepository.findById.mockResolvedValue(
        buildMessage({ senderId: new Types.ObjectId(OTHER_USER_ID) }),
      );
      mockChannelsService.findById.mockResolvedValue(wsChannel);
      mockUsersService.getUserById.mockResolvedValue(
        buildUser(GLOBAL_ROLES.USER),
      );
      mockWorkspaceMemberService.getWorkspacePrivilegeInfo.mockResolvedValue({
        isOwner: false,
        memberRole: SPACE_ROLES.MEMBER,
      });

      await expect(
        service.deleteMessage(MESSAGE_ID, REGULAR_MEMBER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('owner workspace khác xóa tin (cross-workspace) — fail 403', async () => {
      mockMessagesRepository.findById.mockResolvedValue(
        buildMessage({ senderId: new Types.ObjectId(OTHER_USER_ID) }),
      );
      mockChannelsService.findById.mockResolvedValue(wsChannel);
      mockUsersService.getUserById.mockResolvedValue(
        buildUser(GLOBAL_ROLES.USER),
      );
      mockWorkspaceMemberService.getWorkspacePrivilegeInfo.mockResolvedValue({
        isOwner: false,
        memberRole: null,
      });

      await expect(
        service.deleteMessage(MESSAGE_ID, OTHER_WORKSPACE_OWNER_ID),
      ).rejects.toThrow(ForbiddenException);

      expect(
        mockWorkspaceMemberService.getWorkspacePrivilegeInfo,
      ).toHaveBeenCalledWith(WORKSPACE_ID, OTHER_WORKSPACE_OWNER_ID);
    });
  });

  describe('DM channel', () => {
    const dmChannel = buildChannel('dm');

    it('sender tự xóa tin DM của mình — pass', async () => {
      mockMessagesRepository.findById.mockResolvedValue(
        buildMessage({ senderId: new Types.ObjectId(SENDER_ID) }),
      );
      mockChannelsService.findById.mockResolvedValue(dmChannel);
      mockUsersService.getUserById.mockResolvedValue(
        buildUser(GLOBAL_ROLES.USER),
      );

      await expect(
        service.deleteMessage(MESSAGE_ID, SENDER_ID),
      ).resolves.not.toThrow();
    });

    it('super_admin xóa tin DM người khác — fail 403 (DM chỉ sender)', async () => {
      mockMessagesRepository.findById.mockResolvedValue(
        buildMessage({ senderId: new Types.ObjectId(OTHER_USER_ID) }),
      );
      mockChannelsService.findById.mockResolvedValue(dmChannel);
      mockUsersService.getUserById.mockResolvedValue(
        buildUser(GLOBAL_ROLES.SUPER_ADMIN),
      );

      await expect(
        service.deleteMessage(MESSAGE_ID, SUPER_ADMIN_ID),
      ).rejects.toThrow(ForbiddenException);

      expect(
        mockWorkspaceMemberService.getWorkspacePrivilegeInfo,
      ).not.toHaveBeenCalled();
    });

    it('workspace owner xóa tin DM người khác — fail 403', async () => {
      mockMessagesRepository.findById.mockResolvedValue(
        buildMessage({ senderId: new Types.ObjectId(OTHER_USER_ID) }),
      );
      mockChannelsService.findById.mockResolvedValue(dmChannel);
      mockUsersService.getUserById.mockResolvedValue(
        buildUser(GLOBAL_ROLES.USER),
      );

      await expect(
        service.deleteMessage(MESSAGE_ID, WORKSPACE_OWNER_ID),
      ).rejects.toThrow(ForbiddenException);

      expect(
        mockWorkspaceMemberService.getWorkspacePrivilegeInfo,
      ).not.toHaveBeenCalled();
    });
  });

  describe('announcement channel', () => {
    const announcementChannel = buildChannel('announcement');

    it('super_admin xóa tin announcement — pass', async () => {
      mockMessagesRepository.findById.mockResolvedValue(
        buildMessage({ senderId: new Types.ObjectId(OTHER_USER_ID) }),
      );
      mockChannelsService.findById.mockResolvedValue(announcementChannel);
      mockUsersService.getUserById.mockResolvedValue(
        buildUser(GLOBAL_ROLES.SUPER_ADMIN),
      );

      await expect(
        service.deleteMessage(MESSAGE_ID, SUPER_ADMIN_ID),
      ).resolves.not.toThrow();
      expect(
        mockWorkspaceMemberService.getWorkspacePrivilegeInfo,
      ).not.toHaveBeenCalled();
    });

    it('sender (không phải super_admin) xóa tin announcement — fail 403', async () => {
      mockMessagesRepository.findById.mockResolvedValue(
        buildMessage({ senderId: new Types.ObjectId(SENDER_ID) }),
      );
      mockChannelsService.findById.mockResolvedValue(announcementChannel);
      mockUsersService.getUserById.mockResolvedValue(
        buildUser(GLOBAL_ROLES.USER),
      );

      await expect(
        service.deleteMessage(MESSAGE_ID, SENDER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('workspace_admin xóa tin announcement — fail 403', async () => {
      mockMessagesRepository.findById.mockResolvedValue(
        buildMessage({ senderId: new Types.ObjectId(OTHER_USER_ID) }),
      );
      mockChannelsService.findById.mockResolvedValue(announcementChannel);
      mockUsersService.getUserById.mockResolvedValue(
        buildUser(GLOBAL_ROLES.USER),
      );

      await expect(
        service.deleteMessage(MESSAGE_ID, WORKSPACE_ADMIN_ID),
      ).rejects.toThrow(ForbiddenException);

      expect(
        mockWorkspaceMemberService.getWorkspacePrivilegeInfo,
      ).not.toHaveBeenCalled();
    });
  });

  describe('message not found', () => {
    it('ném NotFoundException khi message không tồn tại', async () => {
      mockMessagesRepository.findById.mockResolvedValue(null);

      await expect(
        service.deleteMessage(MESSAGE_ID, SENDER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
