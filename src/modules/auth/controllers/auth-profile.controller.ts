// 📁 src/modules/auth/controllers/auth-profile.controller.ts

import {
  Controller,
  Get,
  UseGuards,
  Request,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UsersService } from '../../users/services/users.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RequestWithUser } from '../interfaces/request-with-user.interface';

@ApiTags('Auth')
@Controller('auth')
export class AuthProfileController {
  private readonly logger = new Logger(AuthProfileController.name);

  constructor(private readonly userService: UsersService) {}

  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Requires a valid access token via Bearer header or HttpOnly cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current user information',
    schema: {
      example: {
        id: '...',
        email: 'user@example.com',
        fullName: 'John Doe',
        role: 'user',
        avatar: 'https://...',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req: RequestWithUser) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('User ID not found in request');
    }
    try {
      return await this.userService.getUserById(userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get user profile: ${message}`);
      throw error;
    }
  }
}
