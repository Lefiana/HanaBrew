import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AllExceptionsFilter } from "./common/all-exceptions.filter.js";
import { ConfigModule } from "./config/config.module.js";
import { PrismaModule } from "./infrastructure/database/prisma.module.js";
import { AppAuthModule } from "./modules/auth/index.js";
import { HealthModule } from "./modules/health/health.module.js";
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
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
