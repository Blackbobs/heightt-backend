// src/v1/search/search.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SearchService } from './search.service';
import { JwtGuard } from '../../common/guards/jwt.guard';
// Import cache decorators
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

  @Get('users')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { q, page, limit } = request.query;
      return `search:users:${q}:${page || 1}:${limit || 10}`;
    },
    ttl: 300, // 5 minutes
    tags: ['search', 'users'],
  })
  @ApiOperation({ summary: 'Search users' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({ status: 200, description: 'Users found' })
  async searchUsers(
    @Query('q') query: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.searchService.searchUsers(
      query,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get('organizations')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { q, page, limit } = request.query;
      return `search:organizations:${q}:${page || 1}:${limit || 10}`;
    },
    ttl: 300, // 5 minutes
    tags: ['search', 'organizations'],
  })
  @ApiOperation({ summary: 'Search organizations' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({ status: 200, description: 'Organizations found' })
  async searchOrganizations(
    @Query('q') query: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.searchService.searchOrganizations(
      query,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get('students')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { q, page, limit } = request.query;
      return `search:students:${q}:${page || 1}:${limit || 10}`;
    },
    ttl: 300, // 5 minutes
    tags: ['search', 'students'],
  })
  @ApiOperation({ summary: 'Search students' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({ status: 200, description: 'Students found' })
  async searchStudents(
    @Query('q') query: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.searchService.searchStudents(
      query,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get('institutions')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { q, page, limit } = request.query;
      return `search:institutions:${q}:${page || 1}:${limit || 10}`;
    },
    ttl: 300, // 5 minutes
    tags: ['search', 'institutions'],
  })
  @ApiOperation({ summary: 'Search institutions' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({ status: 200, description: 'Institutions found' })
  async searchInstitutions(
    @Query('q') query: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.searchService.searchInstitutions(
      query,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Get('global')
  @Cache({
    key: (context) => {
      const request = context.switchToHttp().getRequest();
      const { q, page, limit } = request.query;
      return `search:global:${q}:${page || 1}:${limit || 10}`;
    },
    ttl: 300, // 5 minutes
    tags: ['search', 'global'],
  })
  @ApiOperation({ summary: 'Global search across all entities' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiResponse({ status: 200, description: 'Global search results' })
  async globalSearch(
    @Query('q') query: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    return this.searchService.globalSearch(
      query,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }
}
