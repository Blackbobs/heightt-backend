import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommunicationModule } from '../communication/communication.module';
import { ActivitiesService } from './activities.service';
import { ActivitiesController } from './activities.controller';
import { EventsModule } from '../../events/events.module';

@Module({
  imports: [AuthModule, EventsModule, CommunicationModule],
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
