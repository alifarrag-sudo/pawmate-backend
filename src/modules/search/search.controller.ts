import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get('sitters')
  searchSitters(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('serviceType') serviceType?: string,
    @Query('radius') radius?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLat = +lat;
    const parsedLng = +lng;
    if (!lat || !lng || isNaN(parsedLat) || isNaN(parsedLng)) {
      throw new BadRequestException('lat and lng query parameters are required.');
    }
    return this.searchService.searchSitters({
      lat: parsedLat,
      lng: parsedLng,
      serviceType,
      radiusKm: radius ? +radius : 10,
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
    });
  }
}
