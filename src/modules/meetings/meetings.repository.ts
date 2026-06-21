import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Meeting, MeetingDocument } from './schemas/meeting.schema';
import { BaseRepository } from '../../shared/repositories/base.repository';

@Injectable()
export class MeetingsRepository extends BaseRepository<MeetingDocument> {
  constructor(
    @InjectModel(Meeting.name)
    private readonly meetingModel: Model<MeetingDocument>,
  ) {
    super(meetingModel);
  }
}
