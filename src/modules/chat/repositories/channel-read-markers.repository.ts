import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChannelReadMarker, ChannelReadMarkerDocument } from '../schemas/channel-read-marker.schema';
import { BaseRepository } from '../../../shared/repositories/base.repository';

@Injectable()
export class ChannelReadMarkersRepository extends BaseRepository<ChannelReadMarkerDocument> {
  constructor(
    @InjectModel(ChannelReadMarker.name)
    private readonly readMarkerModel: Model<ChannelReadMarkerDocument>,
  ) {
    super(readMarkerModel);
  }
}
