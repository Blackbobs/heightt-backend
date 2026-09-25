import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { SelfServiceController } from './self-service.controller';
import { SelfServiceService } from './self-service.service';

@Module({
  imports: [AuthModule],
  controllers: [ApprovalsController, SelfServiceController],
  providers: [ApprovalsService, SelfServiceService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
