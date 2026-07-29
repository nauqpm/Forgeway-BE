import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DmOrganizationAmbiguousException } from '../errors/dm-organization-ambiguous.exception';
import { DmOrganizationMismatchException } from '../errors/dm-organization-mismatch.exception';
import { computeDmParticipantKey } from '../utils/dm-participant-key.util';
import { ChannelsService } from './channels.service';

describe('ChannelsService.getOrCreateDM organization scope', () => {
  const firstUserId = new Types.ObjectId().toHexString();
  const secondUserId = new Types.ObjectId().toHexString();
  const organizationId = new Types.ObjectId();

  function createService(options: {
    enabled: boolean;
    existingChannel?: Record<string, unknown> | null;
    firstUserOrganizationIds?: Types.ObjectId[];
    sharedOrganizationIds?: Types.ObjectId[];
  }) {
    const channelId = new Types.ObjectId();
    const findOneExec = jest
      .fn()
      .mockResolvedValue(options.existingChannel ?? null);
    const channelFindOne = jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: findOneExec }),
    });
    const channelCreate = jest.fn().mockImplementation(async data => ({
      _id: channelId,
      ...data,
      toObject: () => ({ _id: channelId, ...data }),
    }));
    const channelsRepository = {
      model: {
        findOne: channelFindOne,
        create: channelCreate,
      },
    };

    const membershipFind = jest
      .fn()
      .mockReturnValueOnce({
        toArray: jest.fn().mockResolvedValue(
          (options.firstUserOrganizationIds ?? [organizationId]).map(
            activeOrganizationId => ({
              organizationId: activeOrganizationId,
              userId: new Types.ObjectId(firstUserId),
            }),
          ),
        ),
      })
      .mockReturnValueOnce({
        toArray: jest.fn().mockResolvedValue(
          (options.sharedOrganizationIds ?? [organizationId]).map(
            activeOrganizationId => ({
              organizationId: activeOrganizationId,
              userId: new Types.ObjectId(secondUserId),
            }),
          ),
        ),
      });
    const memberships = {
      find: membershipFind,
    };
    const connection = {
      collection: jest.fn().mockReturnValue(memberships),
    };
    const config = {
      get: jest.fn().mockReturnValue(options.enabled ? 'true' : 'false'),
    };
    const messagesService = {
      countUnread: jest.fn().mockResolvedValue(0),
    };
    const usersService = {
      getUsersByIds: jest.fn().mockResolvedValue([]),
    };

    const service = new ChannelsService(
      channelsRepository as any,
      {} as any,
      {} as any,
      messagesService as any,
      usersService as any,
      {} as any,
      {} as any,
      {} as any,
      config as any,
      connection as any,
    );

    return {
      service,
      channelFindOne,
      channelCreate,
      connection,
      membershipFind,
    };
  }

  it('keeps the legacy lookup and creation payload when the flag is false', async () => {
    const { service, channelFindOne, channelCreate, connection } =
      createService({ enabled: false });

    await service.getOrCreateDM(firstUserId, secondUserId);

    const sortedIds = [firstUserId, secondUserId]
      .sort()
      .map(id => new Types.ObjectId(id));
    expect(channelFindOne).toHaveBeenCalledWith({
      type: 'dm',
      members: { $all: sortedIds, $size: 2 },
    });
    expect(channelCreate).toHaveBeenCalledWith({
      type: 'dm',
      name: 'Direct Message',
      members: sortedIds,
      isPrivate: true,
      createdBy: new Types.ObjectId(firstUserId),
      workspaceId: null,
    });
    expect(connection.collection).not.toHaveBeenCalled();
  });

  it('creates a scoped DM for participants in the same organization', async () => {
    const { service, channelCreate } = createService({ enabled: true });

    await service.getOrCreateDM(firstUserId, secondUserId);

    expect(channelCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        dmParticipantKey: computeDmParticipantKey(
          new Types.ObjectId(firstUserId),
          new Types.ObjectId(secondUserId),
        ),
      }),
    );
  });

  it('rejects participants without a shared active organization', async () => {
    const { service, channelCreate } = createService({
      enabled: true,
      sharedOrganizationIds: [],
    });

    await expect(
      service.getOrCreateDM(firstUserId, secondUserId),
    ).rejects.toBeInstanceOf(DmOrganizationMismatchException);
    expect(channelCreate).not.toHaveBeenCalled();
  });

  it('rejects participants with multiple shared active organizations', async () => {
    const secondOrganizationId = new Types.ObjectId();
    const { service, channelCreate } = createService({
      enabled: true,
      firstUserOrganizationIds: [organizationId, secondOrganizationId],
      sharedOrganizationIds: [organizationId, secondOrganizationId],
    });

    await expect(
      service.getOrCreateDM(firstUserId, secondUserId),
    ).rejects.toBeInstanceOf(DmOrganizationAmbiguousException);
    expect(channelCreate).not.toHaveBeenCalled();
  });

  it('finds an existing scoped DM by participant key', async () => {
    const existingChannel = {
      _id: new Types.ObjectId(),
      type: 'dm',
      members: [firstUserId, secondUserId],
    };
    const { service, channelFindOne, channelCreate } = createService({
      enabled: true,
      existingChannel,
    });

    await service.getOrCreateDM(firstUserId, secondUserId);

    expect(channelFindOne).toHaveBeenCalledWith({
      type: 'dm',
      organizationId,
      dmParticipantKey: computeDmParticipantKey(
        new Types.ObjectId(firstUserId),
        new Types.ObjectId(secondUserId),
      ),
    });
    expect(channelCreate).not.toHaveBeenCalled();
  });

  it('rejects a scoped self-DM through participant-key validation', async () => {
    const { service, channelFindOne, connection } = createService({
      enabled: true,
    });

    await expect(
      service.getOrCreateDM(firstUserId, firstUserId),
    ).rejects.toEqual(
      new BadRequestException('DM participants must be different users'),
    );
    expect(connection.collection).not.toHaveBeenCalled();
    expect(channelFindOne).not.toHaveBeenCalled();
  });
});
