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
import { REALTIME_EVENT_TYPES } from '../../realtime/contracts/realtime-event-types';

const makeId = () => new Types.ObjectId().toString();

const USER_ID = makeId();
const MESSAGE_ID = makeId();
const CHANNEL_ID = makeId();
const PREV_MESSAGE_ID = makeId();
const SENDER_ID = makeId();

function buildMessage(overrides: Partial<any> = {}) {
  return {
    _id: new Types.ObjectId(MESSAGE_ID),
    senderId: new Types.ObjectId(SENDER_ID),
    channelId: new Types.ObjectId(CHANNEL_ID),
    threadParentId: null,
    attachments: [],
    ...overrides,
  };
}

function buildPreviousMessage() {
  return {
    _id: new Types.ObjectId(PREV_MESSAGE_ID),
    senderId: { _id: new Types.ObjectId(SENDER_ID), fullName: 'Sender User' },
    content: 'previous visible message',
    type: 'text',
    attachments: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('MessagesService.deleteForMe — sidebar lastMessage recalculation', () => {
  let service: MessagesService;
  let mockMessagesRepository: any;
  let mockChannelsService: any;
  let mockRealtimePublisher: any;
  let latestMessageChain: { exec: jest.Mock };

  beforeEach(async () => {
    latestMessageChain = { exec: jest.fn().mockResolvedValue(null) };

    mockMessagesRepository = {
      findById: jest.fn(),
      model: {
        updateOne: jest.fn().mockResolvedValue({}),
        findOne: jest.fn().mockImplementation(() => {
          const chain: any = {};
          chain.sort = jest.fn().mockReturnValue(chain);
          chain.populate = jest.fn().mockReturnValue(chain);
          chain.exec = latestMessageChain.exec;
          return chain;
        }),
      },
    };

    mockChannelsService = {
      validateUserAccess: jest.fn().mockResolvedValue(true),
    };

    mockRealtimePublisher = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: MessagesRepository, useValue: mockMessagesRepository },
        {
          provide: ChannelReadMarkersRepository,
          useValue: { model: { findOne: jest.fn(), updateOne: jest.fn() } },
        },
        { provide: ChannelsService, useValue: mockChannelsService },
        { provide: RealtimePublisher, useValue: mockRealtimePublisher },
        { provide: UsersService, useValue: {} },
        { provide: WorkspaceMemberService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: AttachmentService, useValue: {} },
        { provide: ImagesService, useValue: {} },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
  });

  it('soft-delete: thêm userId vào deletedForUsers', async () => {
    mockMessagesRepository.findById.mockResolvedValue(buildMessage());

    await service.deleteForMe(MESSAGE_ID, USER_ID);

    expect(mockMessagesRepository.model.updateOne).toHaveBeenCalledWith(
      { _id: new Types.ObjectId(MESSAGE_ID) },
      { $addToSet: { deletedForUsers: new Types.ObjectId(USER_ID) } },
    );
  });

  it('top-level message: event kèm lastMessage đã lùi về tin trước đó', async () => {
    mockMessagesRepository.findById.mockResolvedValue(buildMessage());
    latestMessageChain.exec.mockResolvedValue(buildPreviousMessage());

    await service.deleteForMe(MESSAGE_ID, USER_ID);

    expect(mockRealtimePublisher.emit).toHaveBeenCalledWith(
      `user:${USER_ID}`,
      expect.objectContaining({
        type: REALTIME_EVENT_TYPES.CHAT_MESSAGE_DELETED_FOR_ME,
        data: expect.objectContaining({
          messageId: MESSAGE_ID,
          channelId: CHANNEL_ID,
          lastMessage: expect.objectContaining({
            messageId: new Types.ObjectId(PREV_MESSAGE_ID),
            content: 'previous visible message',
            senderName: 'Sender User',
          }),
        }),
      }),
      'chat',
    );
  });

  it('query lastMessage phải loại trừ tin user đã xóa (deletedForUsers $ne userId)', async () => {
    mockMessagesRepository.findById.mockResolvedValue(buildMessage());

    await service.deleteForMe(MESSAGE_ID, USER_ID);

    expect(mockMessagesRepository.model.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: new Types.ObjectId(CHANNEL_ID),
        threadParentId: null,
        deletedForUsers: { $ne: new Types.ObjectId(USER_ID) },
      }),
    );
  });

  it('không còn tin nhắn nào hiển thị: gửi lastMessage null tường minh (không omit field)', async () => {
    mockMessagesRepository.findById.mockResolvedValue(buildMessage());
    latestMessageChain.exec.mockResolvedValue(null);

    await service.deleteForMe(MESSAGE_ID, USER_ID);

    const [, envelope] = mockRealtimePublisher.emit.mock.calls[0];
    expect(envelope.data).toHaveProperty('lastMessage', null);
  });

  it('thread reply: không recompute, payload không chứa lastMessage', async () => {
    mockMessagesRepository.findById.mockResolvedValue(
      buildMessage({ threadParentId: new Types.ObjectId(makeId()) }),
    );

    await service.deleteForMe(MESSAGE_ID, USER_ID);

    expect(mockMessagesRepository.model.findOne).not.toHaveBeenCalled();
    const [, envelope] = mockRealtimePublisher.emit.mock.calls[0];
    expect(envelope.data).not.toHaveProperty('lastMessage');
  });

  it('message không tồn tại — ném NotFoundException', async () => {
    mockMessagesRepository.findById.mockResolvedValue(null);

    await expect(service.deleteForMe(MESSAGE_ID, USER_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(mockRealtimePublisher.emit).not.toHaveBeenCalled();
  });

  it('messageId không hợp lệ — ném NotFoundException', async () => {
    await expect(service.deleteForMe('invalid-id', USER_ID)).rejects.toThrow(
      NotFoundException,
    );
    expect(mockMessagesRepository.findById).not.toHaveBeenCalled();
  });

  it('user không có quyền truy cập channel — ném ForbiddenException', async () => {
    mockMessagesRepository.findById.mockResolvedValue(buildMessage());
    mockChannelsService.validateUserAccess.mockResolvedValue(false);

    await expect(service.deleteForMe(MESSAGE_ID, USER_ID)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockRealtimePublisher.emit).not.toHaveBeenCalled();
  });
});
