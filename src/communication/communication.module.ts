import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GatewaysModule } from '../gateways/gateways.module';
import { EventsModule } from '../events/events.module';
import { CommunicationController } from './communication.controller';
import { AnnouncementService } from './announcement.service';
import { NotificationService } from './notification.service';

@Module({
  imports: [AuthModule, GatewaysModule, EventsModule],
  controllers: [CommunicationController],
  providers: [AnnouncementService, NotificationService],
  exports: [AnnouncementService, NotificationService],
})
export class CommunicationModule {}
