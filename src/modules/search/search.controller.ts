import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SearchService } from './search.service';

/**
 * City-center fallback coordinates. When the client doesn't have GPS
 * permission (or hasn't requested it yet), it can pass a `city` query
 * parameter and we use the centroid below to anchor the search.
 *
 * Lookups are case-insensitive — keys are lowercased.
 */
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  cairo: { lat: 30.0444, lng: 31.2357 },
  alexandria: { lat: 31.2001, lng: 29.9187 },
  giza: { lat: 30.0131, lng: 31.2089 },
  maadi: { lat: 29.9602, lng: 31.2569 },
  // Add more Egyptian cities here as we expand.
};

function resolveCoordinates(
  lat?: string,
  lng?: string,
  city?: string,
): { lat: number; lng: number } {
  // Explicit lat/lng wins.
  if (lat && lng) {
    const parsedLat = +lat;
    const parsedLng = +lng;
    if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
      return { lat: parsedLat, lng: parsedLng };
    }
  }

  // City fallback.
  if (city) {
    const normalized = city.trim().toLowerCase();
    const coords = CITY_COORDS[normalized];
    if (coords) return coords;
  }

  throw new BadRequestException(
    'lat and lng query parameters are required (or pass a recognised city: ' +
      Object.keys(CITY_COORDS).join(', ') +
      ').',
  );
}

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get('sitters/nearby')
  @ApiOperation({ summary: 'Find sitters near a coordinate (lat/lng or city fallback)' })
  findNearbySitters(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('city') city?: string,
    @Query('radius') radius?: string,
    @Query('serviceType') serviceType?: string,
    @Query('limit') limit?: string,
    @Query('maxPrice') maxPrice?: string,
  ) {
    const coords = resolveCoordinates(lat, lng, city);
    return this.searchService.findNearbySitters({
      lat: coords.lat,
      lng: coords.lng,
      radiusKm: radius ? +radius : 10,
      serviceType,
      limit: limit ? +limit : 20,
      maxPrice: maxPrice ? +maxPrice : undefined,
    });
  }

  @Get('sitters')
  @ApiOperation({ summary: 'Search sitters with pagination (lat/lng or city fallback)' })
  searchSitters(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('city') city?: string,
    @Query('serviceType') serviceType?: string,
    @Query('radius') radius?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('maxPrice') maxPrice?: string,
  ) {
    const coords = resolveCoordinates(lat, lng, city);
    return this.searchService.searchSitters({
      lat: coords.lat,
      lng: coords.lng,
      serviceType,
      radiusKm: radius ? +radius : 10,
      page: page ? +page : 1,
      limit: limit ? +limit : 20,
      maxPrice: maxPrice ? +maxPrice : undefined,
    });
  }
}
