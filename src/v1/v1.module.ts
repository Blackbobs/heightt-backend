import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { StudentsModule } from './students/students.module';
import { FinanceModule } from './finance/finance.module';
import { ActivitiesModule } from './activities/activities.module';
import { GovernanceModule } from './governance/governance.module';
import { CommunicationModule } from './communication/communication.module';
import { PlatformModule } from './platform/platform.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { RbacModule } from './rbac/rbac.module';
import { AuditModule } from './audit/audit.module';
import { SearchModule } from './search/search.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { FilesModule } from './files/files.module';
import { HealthModule } from './health/health.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { BachsModule } from './bachs/bachs.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    InstitutionsModule,
    OrganizationsModule,
    StudentsModule,
    FinanceModule,
    ActivitiesModule,
    GovernanceModule,
    CommunicationModule,
    PlatformModule,
    DashboardModule,
    RbacModule,
    AuditModule,
    SearchModule,
    AnalyticsModule,
    FilesModule,
    HealthModule,
    OnboardingModule,
    BachsModule,
  ],
  exports: [
    AuthModule,
    UsersModule,
    InstitutionsModule,
    OrganizationsModule,
    StudentsModule,
    FinanceModule,
    ActivitiesModule,
    GovernanceModule,
    CommunicationModule,
    PlatformModule,
    DashboardModule,
    RbacModule,
    AuditModule,
    SearchModule,
    AnalyticsModule,
    FilesModule,
    HealthModule,
    OnboardingModule,
    BachsModule,
  ],
})
export class V1Module {}
