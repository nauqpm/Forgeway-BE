import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { UtilitiesService } from '../services/utilities.service';
import { CreateAmenityDto, UpdateAmenityDto } from '../dtos/create-amenity.dto';

@ApiTags('Utilities')
@Controller('amenitiesapi')
export class UtilitiesController {
  constructor(private readonly utilitiesService: UtilitiesService) {}

  @Get()
  async findAll() {
    return this.utilitiesService.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.utilitiesService.findById(id);
  }

  @Get('category/:category')
  async findByCategory(@Param('category') category: string) {
    return this.utilitiesService.findByCategory(category);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async create(@Body() createAmenityDto: CreateAmenityDto) {
    return this.utilitiesService.create(createAmenityDto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async update(
    @Param('id') id: string,
    @Body() updateAmenityDto: UpdateAmenityDto,
  ) {
    return this.utilitiesService.update(id, updateAmenityDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async delete(@Param('id') id: string) {
    await this.utilitiesService.delete(id);
    return { message: 'Amenity deleted successfully' };
  }
}
