import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { CalendarController } from "./calendar.controller.js";
import { CalendarService } from "./calendar.service.js";
import { DeadlinesController } from "./deadlines.controller.js";

@Module({
  imports: [WorkspacesModule, TasksModule, ProjectsModule],
  controllers: [CalendarController, DeadlinesController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
