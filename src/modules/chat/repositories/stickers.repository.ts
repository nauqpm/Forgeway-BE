import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Sticker, StickerDocument } from '../schemas/sticker.schema';
import { BaseRepository } from '../../../shared/repositories/base.repository';

@Injectable()
export class StickersRepository extends BaseRepository<StickerDocument> {
  constructor(
    @InjectModel(Sticker.name)
    private readonly stickerModel: Model<StickerDocument>,
  ) {
    super(stickerModel);
  }
}
