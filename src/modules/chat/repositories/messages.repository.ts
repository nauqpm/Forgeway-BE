import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import { Message, MessageDocument } from '../schemas/message.schema';
import { BaseRepository } from '../../../shared/repositories/base.repository';

@Injectable()
export class MessagesRepository extends BaseRepository<MessageDocument> {
  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<MessageDocument>,
  ) {
    super(messageModel);
  }

  override buildSoftDeleteFilter(includeDeleted = false): FilterQuery<MessageDocument> {
    return includeDeleted ? {} : { deletedAt: null };
  }
}
