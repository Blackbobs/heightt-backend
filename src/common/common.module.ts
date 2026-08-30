import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { KeepAliveService } from './services/keep-alive.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [KeepAliveService],
})
export class CommonModule {}
