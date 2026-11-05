import { Module } from "@nestjs/common";
import { CalendarModule } from "../calendar/calendar.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { SettingsModule } from "../settings/settings.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";
import { AiConversationsService } from "./ai-conversations.service.js";
import { AiProvidersService } from "./ai-providers.service.js";
import { AiSettingsService } from "./ai-settings.service.js";
import { AiController } from "./ai.controller.js";
import { AiService } from "./ai.service.js";
import { AI_PROVIDER_FACTORY, defaultProviderFactory } from "./provider-factory.js";
import { AiToolsService } from "./tools/tools.service.js";

@Module({
  imports: [WorkspacesModule, TasksModule, ProjectsModule, CalendarModule, SettingsModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiProvidersService,
    AiSettingsService,
    AiConversationsService,
    AiToolsService,
    { provide: AI_PROVIDER_FACTORY, useValue: defaultProviderFactory },
  ],
})
export class AiModule {}
