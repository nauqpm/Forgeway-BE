import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  BadRequestException,
  Logger,
  Query,
} from '@nestjs/common';
import { UsersService } from '../services/users.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreateUsersDto } from '../dtos/create-users.dto';
import { UpdateUserProfileDto, UpdateUsersDto } from '../dtos/update-users.dto';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { PermissionGuard } from '../../permissions/guards/permission.guard';
import { RequirePermission } from '../../../common/decorators/permission.decorator';
import { GLOBAL_ROLES } from '../../../common/constants/global-role.constants';

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(GLOBAL_ROLES.USER, GLOBAL_ROLES.SUPER_ADMIN)
  @Get('all')
  async getAllUsersForSearch(
    @Request() req,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    const normalizedSearch = search?.trim() ?? '';
    if (normalizedSearch.length < 2) {
      throw new BadRequestException(
        'Search query must be at least 2 characters.',
      );
    }

    const parsedLimit = limit ? Number.parseInt(limit, 10) : 20;
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.min(50, Math.max(1, parsedLimit))
      : 20;

    this.logger.log(
      `Searching users. Query: ${normalizedSearch}, Limit: ${safeLimit}, User: ${req.user.userId}`,
    );

    return await this.usersService.searchUsers(
      normalizedSearch,
      req.user.userId,
      safeLimit,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req) {
    return await this.usersService.getUserById(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Roles(GLOBAL_ROLES.USER)
  @Put('me')
  async updateProfile(
    @Request() req,
    @Body() updateUserDto: UpdateUserProfileDto,
  ) {
    return await this.usersService.updateUser(req.user.userId, updateUserDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
  @RequirePermission('users', 'update')
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @Get()
  async getAllUsers() {
    return await this.usersService.getAllUsers();
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
  @RequirePermission('users', 'read')
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @Get(':id')
  async getUserById(@Param('id') id: string) {
    return await this.usersService.getUserById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
  @RequirePermission('users', 'create')
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @Post()
  async createUser(@Body() createUserDto: CreateUsersDto) {
    const existingUser = await this.usersService.findByEmail(
      createUserDto.email,
    );
    if (existingUser) {
      throw new BadRequestException('Email đã tồn tại');
    }

    return await this.usersService.createUser(createUserDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
  @RequirePermission('users', 'update')
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @Put(':id')
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUsersDto,
  ) {
    return await this.usersService.updateUser(id, updateUserDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard, PermissionGuard)
  @RequirePermission('users', 'delete')
  @Roles(GLOBAL_ROLES.SUPER_ADMIN)
  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    return await this.usersService.deleteUser(id);
  }
}
