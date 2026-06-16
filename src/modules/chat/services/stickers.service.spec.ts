import { Test, TestingModule } from '@nestjs/testing';
import { StickersService } from './stickers.service';
import { StickerPacksRepository } from '../repositories/sticker-packs.repository';
import { StickersRepository } from '../repositories/stickers.repository';
import { Types } from 'mongoose';

describe('StickersService', () => {
  let service: StickersService;
  let stickerPacksRepository: jest.Mocked<StickerPacksRepository>;
  let stickersRepository: jest.Mocked<StickersRepository>;

  const mockPackId = new Types.ObjectId();
  const mockStickerId = new Types.ObjectId();

  const mockPacks = [
    {
      _id: mockPackId,
      key: 'quby',
      name: 'Quby',
      isActive: true,
      displayOrder: 1,
      toObject() {
        return this;
      },
    },
  ];

  const mockStickers = [
    {
      _id: mockStickerId,
      packId: mockPackId,
      code: 'quby_01',
      url: 'https://example.com/quby_01.gif',
      isAnimated: true,
      width: 120,
      height: 120,
      toObject() {
        return this;
      },
    },
  ];

  beforeEach(async () => {
    const mockPacksRepo = {
      find: jest.fn().mockResolvedValue(mockPacks),
    };

    const mockStickersRepo = {
      find: jest.fn().mockResolvedValue(mockStickers),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StickersService,
        {
          provide: StickerPacksRepository,
          useValue: mockPacksRepo,
        },
        {
          provide: StickersRepository,
          useValue: mockStickersRepo,
        },
      ],
    }).compile();

    service = module.get<StickersService>(StickersService);
    stickerPacksRepository = module.get(StickerPacksRepository);
    stickersRepository = module.get(StickersRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return active sticker packs with their stickers', async () => {
    const result = await service.getAllActivePacksWithStickers();

    expect(stickerPacksRepository.find).toHaveBeenCalledWith(
      { isActive: true },
      undefined,
      { sort: { displayOrder: 1, createdAt: 1 } },
    );

    expect(stickersRepository.find).toHaveBeenCalledWith(
      { packId: { $in: [mockPackId] } },
      undefined,
      { sort: { code: 1 } },
    );

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('quby');
    expect(result[0].stickers).toHaveLength(1);
    expect(result[0].stickers[0].code).toBe('quby_01');
  });
});
