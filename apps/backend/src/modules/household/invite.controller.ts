import { Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { HouseholdResponse } from "@kitchenpal/api-contract";
import type { AuthUser } from "../../common/scope/auth-user";
import { CurrentUser } from "../../common/scope/current-user.decorator";
import { HouseholdService } from "./services/household.service";

/**
 * Invite acceptance. Accepting a valid, unexpired code is the ONLY way to join a
 * household — there is no self-join endpoint. The acting user is taken from the
 * JWT so the code cannot be redeemed on another account's behalf.
 */
@ApiTags("households")
@ApiBearerAuth()
@Controller("invites")
export class InviteController {
  constructor(private readonly households: HouseholdService) {}

  @Post(":code/accept")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Accept an invite code and join the household" })
  accept(
    @CurrentUser() user: AuthUser,
    @Param("code") code: string,
  ): Promise<HouseholdResponse> {
    return this.households.acceptInvite(user.id, code);
  }
}
