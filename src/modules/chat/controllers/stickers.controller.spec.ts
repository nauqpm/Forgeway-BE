import { Test, TestingModule } from '@nestjs/testing';
import { StickersController } from './stickers.controller';
import { StickersService } from '../services/stickers.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';

describe('StickersController', () => {
  let controller: StickersController;
  let service: jest.Mocked<StickersService>;

  const mockPacksWithStickers = [
    {
      _id: 'pack-id',
      key: 'quby',
      name: 'Quby',
      bannerUrl: 'https://example.com/banner.gif',
      isActive: true,
      displayOrder: 1,
      stickers: [
        {
          _id: 'sticker-id',
          packId: 'pack-id',
          code: 'quby_01',
          url: 'https://example.com/sticker.gif',
          isAnimated: true,
          width: 120,
          height: 120,
        },
      ],
    },
  ];

  beforeEach(async () => {
    const mockStickersService = {
      getAllActivePacksWithStickers: jest
        .fn()
        .mockResolvedValue(mockPacksWithStickers),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StickersController],
      providers: [
        {
          provide: StickersService,
          useValue: mockStickersService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StickersController>(StickersController);
    service = module.get(StickersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return active packs with stickers', async () => {
    const result = await controller.getStickers();

    expect(service.getAllActivePacksWithStickers).toHaveBeenCalled();
    expect(result).toEqual(mockPacksWithStickers);
  });
});
