// src/v1/search/search.controller.ts
import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  Post,
  Delete,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SearchService } from './search.service';
import { JwtGuard } from '../../common/guards/jwt.guard';
import { AdminGuard, RequirePermission } from '../../common/guards/admin.guard';
import {
  SearchQueryDto,
  SearchResponseDto,
  AutoCompleteDto,
} from './dto/search.dto';
import {
  Cache,
  Cacheable,
  CacheKey,
  InvalidateCache,
} from '../../common/decorators/cache.decorator';

@ApiTags('search')
@Controller('search')
@UseGuards(JwtGuard)
@ApiBearerAuth('access-token')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const {
        q,
        entityType,
        page,
        limit,
        institutionId,
        organizationId,
        dateFrom,
        dateTo,
        sortBy,
        sortOrder,
      } = request.query;
      return `search:${q}:${entityType || 'all'}:${page || 1}:${limit || 10}:${institutionId || 'all'}:${organizationId || 'all'}:${dateFrom || 'all'}:${dateTo || 'all'}:${sortBy || 'relevance'}:${sortOrder || 'desc'}`;
    },
    ttl: 300,
    tags: ['search'],
  })
  @ApiOperation({ summary: 'Search across all entities' })
  @ApiResponse({
    status: 200,
    description: 'Search results',
    type: SearchResponseDto,
  })
  async search(@Query() dto: SearchQueryDto, @Request() req: any) {
    // Save search history
    await this.searchService.saveSearchHistory(
      req.user.id,
      dto.q,
      dto.entityType,
    );
    return this.searchService.search(dto);
  }

  @Get('autocomplete')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { q, limit, institutionId } = request.query;
      return `autocomplete:${q}:${limit || 5}:${institutionId || 'all'}`;
    },
    ttl: 300,
    tags: ['search'],
  })
  @ApiOperation({ summary: 'Get autocomplete suggestions' })
  @ApiResponse({
    status: 200,
    description: 'Autocomplete suggestions',
  })
  async autocomplete(@Query() dto: AutoCompleteDto) {
    return this.searchService.autocomplete(dto);
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'Get search suggestions' })
  @ApiResponse({
    status: 200,
    description: 'Search suggestions',
  })
  async getSuggestions(@Query('q') query: string) {
    return this.searchService.getSuggestions(query);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get search history' })
  @ApiResponse({
    status: 200,
    description: 'Search history',
  })
  async getSearchHistory(@Request() req: any) {
    return this.searchService.getSearchHistory(req.user.id);
  }

  @Delete('history')
  @ApiOperation({ summary: 'Clear search history' })
  @ApiResponse({
    status: 200,
    description: 'Search history cleared',
  })
  async clearSearchHistory(@Request() req: any) {
    return this.searchService.clearSearchHistory(req.user.id);
  }

  @Post('cache/invalidate')
  @UseGuards(AdminGuard)
  @RequirePermission('search:manage')
  @InvalidateCache(['search'])
  @ApiOperation({
    summary: 'Invalidate search cache (Admin only)',
    description: 'Clear all search-related cache.',
  })
  @ApiResponse({
    status: 200,
    description: 'Search cache invalidated',
  })
  async invalidateSearchCache() {
    await this.searchService.invalidateSearchCache();
    return {
      message: 'Search cache invalidated successfully',
      invalidatedAt: new Date().toISOString(),
    };
  }
}
