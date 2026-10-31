import { Controller, Get } from "@nestjs/common";
import { ApiCookieAuth, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import type { MeResponse } from "@hanabrew/contracts";
import { CurrentUser, type AuthenticatedUser } from "../auth/index.js";
import { UsersService } from "./users.service.js";

@ApiTags("users")
@ApiCookieAuth()
@Controller("me")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOkResponse({ description: "The signed-in user and their personal workspace." })
  @ApiUnauthorizedResponse({ description: "No valid session." })
  me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    return this.users.getMe(user);
  }
}
