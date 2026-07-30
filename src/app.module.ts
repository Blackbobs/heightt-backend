import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { FilesModule } from './files/files.module';
import { UsersModule } from './users/users.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { StudentsModule } from './students/students.module';
import { FinanceModule } from './finance/finance.module';
import { EventsModule } from './events/events.module';
import { GatewaysModule } from './gateways/gateways.module';
import { CommunicationModule } from './communication/communication.module';
import { GovernanceModule } from './governance/governance.module';
import { ActivitiesModule } from './activities/activities.module';
import { PlatformModule } from './platform/platform.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { RbacModule } from './rbac/rbac.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { SearchModule } from './search/search.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.development'],
    }),
    PrismaModule,
    RedisModule,
    EmailModule,
    AuthModule,
    OnboardingModule,
    FilesModule,
    UsersModule,
    InstitutionsModule,
    OrganizationsModule,
    StudentsModule,
    FinanceModule,
    EventsModule,
    GatewaysModule,
    CommunicationModule,
    GovernanceModule,
    ActivitiesModule,
    PlatformModule,
    DashboardModule,
    RbacModule,
    AuditModule,
    HealthModule,
    SearchModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
