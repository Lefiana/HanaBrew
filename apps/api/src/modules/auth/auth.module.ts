import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { ENV, type Env } from "../../config/config.module.js";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { WorkspacesService } from "../workspaces/workspaces.service.js";
import { createAuth } from "./auth.factory.js";

@Module({
  imports: [
    AuthModule.forRootAsync({
      imports: [WorkspacesModule],
      inject: [PrismaService, ENV, WorkspacesService],
      useFactory: (prisma: PrismaService, env: Env, workspaces: WorkspacesService) => ({
        auth: createAuth({ prisma, env, workspaces }),
        // CORS is configured once, globally, in bootstrap.ts.
        disableTrustedOriginsCors: true,
      }),
    }),
  ],
})
export class AppAuthModule {}
