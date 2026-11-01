import { Module } from "@nestjs/common";
import { CalendarModule } from "../calendar/calendar.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

@Module({
  imports: [WorkspacesModule, TasksModule, CalendarModule, ProjectsModule, SettingsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
