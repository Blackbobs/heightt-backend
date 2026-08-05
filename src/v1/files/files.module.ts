// src/v1/files/files.module.ts
import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
// import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { AuthModule } from '../auth/auth.module';
import { EventService } from '../../events/event.service';

@Module({
  imports: [AuthModule],
  controllers: [FilesController],
  providers: [FilesService, CacheService, EventService],
  exports: [FilesService],
})
export class FilesModule {}
