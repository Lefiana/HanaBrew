import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AllExceptionsFilter } from "./common/all-exceptions.filter.js";
import { ConfigModule } from "./config/config.module.js";
import { PrismaModule } from "./infrastructure/database/prisma.module.js";
import { AppAuthModule } from "./modules/auth/index.js";
import { AiModule } from "./modules/ai/ai.module.js";
import { CalendarModule } from "./modules/calendar/calendar.module.js";
import { DashboardModule } from "./modules/dashboard/dashboard.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { ProjectsModule } from "./modules/projects/projects.module.js";
import { SettingsModule } from "./modules/settings/settings.module.js";
import { TasksModule } from "./modules/tasks/tasks.module.js";
import { UsersModule } from "./modules/users/users.module.js";
import { WorkspacesModule } from "./modules/workspaces/workspaces.module.js";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    WorkspacesModule,
    AppAuthModule,
    HealthModule,
    UsersModule,
    SettingsModule,
    TasksModule,
    ProjectsModule,
    CalendarModule,
    DashboardModule,
    AiModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
