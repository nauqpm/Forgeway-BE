import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Channel,
  ChannelDocument,
  ChannelMemberEmbedded,
} from '../schemas/channel.schema';
import { BaseRepository } from '../../../shared/repositories/base.repository';

export type ChannelMemberToAdd = Pick<
  ChannelMemberEmbedded,
  'userId' | 'role' | 'joinedAt' | 'invitedBy' | 'joined'
>;

export interface AddChannelMembersResult {
  channel: ChannelDocument | null;
  addedUserIds: string[];
}

@Injectable()
export class ChannelsRepository extends BaseRepository<ChannelDocument> {
  constructor(
    @InjectModel(Channel.name)
    private readonly channelModel: Model<ChannelDocument>,
  ) {
    super(channelModel);
  }

  async addMembersIfAbsent(
    channelId: string,
    members: ChannelMemberToAdd[],
  ): Promise<AddChannelMembersResult> {
    if (!Types.ObjectId.isValid(channelId)) {
      return { channel: null, addedUserIds: [] };
    }

    const uniqueMembers = Array.from(
      new Map(
        members.map(member => [member.userId.toString(), member]),
      ).values(),
    );
    const addedUserIds: string[] = [];

    for (const member of uniqueMembers) {
      const updated = await this.channelModel
        .findOneAndUpdate(
          {
            _id: new Types.ObjectId(channelId),
            'channelMembers.userId': { $ne: member.userId },
          },
          { $addToSet: { channelMembers: member } },
          { new: true },
        )
        .exec();

      if (updated) {
        addedUserIds.push(member.userId.toString());
      }
    }

    const channel = await this.channelModel.findById(channelId).exec();
    return { channel, addedUserIds };
  }
}
