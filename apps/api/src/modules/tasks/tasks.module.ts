import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { TasksController } from "./tasks.controller.js";
import { TasksService } from "./tasks.service.js";

@Module({
  imports: [WorkspacesModule, SettingsModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
