import {
  Controller,
  Get,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ForYouResponseDto } from '../dtos/for-you.dto';
import { ForYouService } from '../services/for-you.service';

@ApiTags('For-You')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('for-you')
export class ForYouController {
  constructor(private readonly forYouService: ForYouService) {}

  /**
   * Returns active workspaces where the authenticated user is either owner or member.
   */
  @Get()
  @ApiOperation({
    summary: 'Get workspaces for the For You page',
    description:
      'Returns active workspaces owned by or shared with the authenticated user. The response includes the user role and ownership label for each workspace.',
  })
  @ApiResponse({
    status: 200,
    description: 'For You workspace list returned successfully',
    type: ForYouResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Missing, invalid, or expired authentication token' })
  async getForYou(
    @Request() req: { user: { userId: string } },
  ): Promise<ForYouResponseDto> {
    return this.forYouService.getForYouWorkspaces(req.user.userId);
  }
}
