import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AddressesService } from '../services/addresses.service';
import { CreateAddressDto, UpdateAddressDto } from '../dtos/create-address.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('Addresses')
@Controller('addressesapi')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  async findAll(@CurrentUser('userId') userId: string) {
    return this.addressesService.findAll(userId);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.addressesService.findById(id, userId);
  }

  @Post()
  async create(@Body() createAddressDto: CreateAddressDto, @CurrentUser('userId') userId: string) {
    return this.addressesService.create(createAddressDto, userId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateAddressDto: UpdateAddressDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.addressesService.update(id, updateAddressDto, userId);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    await this.addressesService.delete(id, userId);
    return { message: 'Address deleted successfully' };
  }

  @Put(':id/default')
  async setDefault(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.addressesService.setDefault(id, userId);
  }
}
