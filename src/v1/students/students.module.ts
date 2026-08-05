// src/v1/students/students.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { CacheService } from '../../redis/cache.service';
import { CommunicationModule } from '../communication/communication.module';
import { PromotionService } from './promotion.service';
import { EventService } from '../../events/event.service';
// import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [AuthModule, CommunicationModule],
  controllers: [StudentsController],
  providers: [StudentsService, CacheService, PromotionService, EventService],
  exports: [StudentsService],
})
export class StudentsModule {}
