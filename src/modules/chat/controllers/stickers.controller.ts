import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';
import { StickersService } from '../services/stickers.service';

@Controller('chat/stickers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StickersController {
  constructor(private readonly stickersService: StickersService) {}

  @Get()
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  async getStickers() {
    return this.stickersService.getAllActivePacksWithStickers();
  }
}
