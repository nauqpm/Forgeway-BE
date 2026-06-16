import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StickerPack, StickerPackDocument } from '../schemas/sticker-pack.schema';
import { BaseRepository } from '../../../shared/repositories/base.repository';

@Injectable()
export class StickerPacksRepository extends BaseRepository<StickerPackDocument> {
  constructor(
    @InjectModel(StickerPack.name)
    private readonly stickerPackModel: Model<StickerPackDocument>,
  ) {
    super(stickerPackModel);
  }
}
