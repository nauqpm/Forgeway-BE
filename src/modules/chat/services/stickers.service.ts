import { Injectable } from '@nestjs/common';
import { StickerPacksRepository } from '../repositories/sticker-packs.repository';
import { StickersRepository } from '../repositories/stickers.repository';

@Injectable()
export class StickersService {
  constructor(
    private readonly stickerPacksRepository: StickerPacksRepository,
    private readonly stickersRepository: StickersRepository,
  ) {}

  async getAllActivePacksWithStickers() {
    const packs = await this.stickerPacksRepository.find(
      { isActive: true },
      undefined,
      { sort: { displayOrder: 1, createdAt: 1 } },
    );

    const packIds = packs.map((p) => p._id);
    const stickers = await this.stickersRepository.find(
      { packId: { $in: packIds } },
      undefined,
      { sort: { code: 1 } },
    );

    const stickersByPackId = new Map<string, any[]>();
    for (const sticker of stickers) {
      const packIdStr = sticker.packId.toString();
      if (!stickersByPackId.has(packIdStr)) {
        stickersByPackId.set(packIdStr, []);
      }
      stickersByPackId.get(packIdStr)!.push(sticker);
    }

    return packs.map((pack) => {
      const packObj = pack.toObject ? pack.toObject() : pack;
      return {
        ...packObj,
        stickers: stickersByPackId.get(pack._id.toString()) || [],
      };
    });
  }
}
