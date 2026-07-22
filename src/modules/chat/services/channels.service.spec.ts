import { Test, TestingModule } from '@nestjs/testing';
import { ChannelsService } from './channels.service';
import { ChannelsRepository } from '../repositories/channels.repository';
import { WorkspacesService } from '../../workspaces/services/workspaces.service';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';
import { MessagesService } from './messages.service';
import { UsersService } from '../../users/services/users.service';
import { RealtimePublisher } from '../../realtime/publishers/realtime.publisher';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ChannelMembersService } from './channel-members.service';
import { CustomChannelsService } from './custom-channels.service';
import { Types } from 'mongoose';
import { ForbiddenException } from '@nestjs/common';

describe('ChannelsService', () => {
  let service: ChannelsService;
  let mockChannelsRepository: any;

  beforeEach(async () => {
    mockChannelsRepository = {
      model: {
        findOne: jest.fn().mockReturnThis(),
        lean: jest.fn().mockReturnThis(),
        exec: jest.fn(),
        create: jest.fn(),
        findByIdAndUpdate: jest.fn().mockReturnThis(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelsService,
        { provide: ChannelsRepository, useValue: mockChannelsRepository },
        { provide: WorkspacesService, useValue: {} },
        { provide: WorkspaceMemberService, useValue: {} },
        {
          provide: MessagesService,
          useValue: { countUnread: jest.fn().mockResolvedValue(0) },
        },
        {
          provide: UsersService,
          useValue: { getUsersByIds: jest.fn().mockResolvedValue([]) },
        },
        { provide: RealtimePublisher, useValue: {} },
        { provide: EventEmitter2, useValue: {} },
        { provide: ChannelMembersService, useValue: {} },
        { provide: CustomChannelsService, useValue: {} },
      ],
    }).compile();

    service = module.get<ChannelsService>(ChannelsService);
  });

  describe('getOrCreateDM', () => {
    it('should create a group DM successfully when members are unique', async () => {
      const userId = new Types.ObjectId().toString();
      const targetUserIds = [
        new Types.ObjectId().toString(),
        new Types.ObjectId().toString(),
      ];

      mockChannelsRepository.model.exec.mockResolvedValueOnce(null);
      const mockCreatedDM = {
        toObject: () => ({
          _id: 'newDM',
          type: 'dm',
          members: [userId, ...targetUserIds],
        }),
      };
      mockChannelsRepository.model.create.mockResolvedValueOnce(mockCreatedDM);

      const result = await service.getOrCreateDM(userId, targetUserIds);

      expect(mockChannelsRepository.model.create).toHaveBeenCalled();
      expect(result._id).toEqual('newDM');
    });

    it('should return existing DM if exactly identical members request it', async () => {
      const userId = new Types.ObjectId().toString();
      const targetUserIds = [new Types.ObjectId().toString()];

      const existingDM = {
        _id: 'existingDM',
        type: 'dm',
        members: [userId, targetUserIds[0]],
      };
      mockChannelsRepository.model.exec.mockResolvedValueOnce(existingDM);

      const result = await service.getOrCreateDM(userId, targetUserIds);

      expect(mockChannelsRepository.model.create).not.toHaveBeenCalled();
      expect(result._id).toEqual('existingDM');
    });
  });

  describe('updateChannel', () => {
    it('should throw ForbiddenException if a non-member tries to update channel name', async () => {
      const channelId = new Types.ObjectId().toString();
      const userId = new Types.ObjectId().toString();

      jest
        .spyOn(service as any, 'validateUserAccess')
        .mockResolvedValueOnce(false);

      await expect(
        service.updateChannel(channelId, userId, { name: 'New Name' }),
      ).rejects.toThrow(ForbiddenException);
      expect(
        mockChannelsRepository.model.findByIdAndUpdate,
      ).not.toHaveBeenCalled();
    });
  });
});
