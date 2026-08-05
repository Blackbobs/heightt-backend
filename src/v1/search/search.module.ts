// src/v1/search/search.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { CacheService } from '../../redis/cache.service';
// import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [AuthModule],
  controllers: [SearchController],
  providers: [SearchService, CacheService],
  exports: [SearchService],
})
export class SearchModule {}
