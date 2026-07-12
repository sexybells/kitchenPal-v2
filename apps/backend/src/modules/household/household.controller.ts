import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  createHouseholdSchema,
  createInviteSchema,
  objectIdSchema,
  updateHouseholdSchema,
  updateMemberSchema,
  type CreateHouseholdInput,
  type CreateInviteInput,
  type HouseholdInviteResponse,
  type HouseholdJoinResult,
  type HouseholdMemberResponse,
  type HouseholdResponse,
  type UpdateHouseholdInput,
  type UpdateMemberInput,
} from "@kitchenpal/api-contract";
import type { AuthUser } from "../../common/scope/auth-user";
import { CurrentUser } from "../../common/scope/current-user.decorator";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { HouseholdService } from "./services/household.service";

/**
 * Household, member, and invite management. Every route derives identity from the
 * JWT (`CurrentUser`) and enforces membership/role inside {@link HouseholdService}
 * against the `:householdId` in the path — never from a client-asserted scope.
 */
@ApiTags("households")
@ApiBearerAuth()
@Controller("households")
export class HouseholdController {
  constructor(private readonly households: HouseholdService) {}

  @Post()
  @ApiOperation({
    summary: "Create a household (caller becomes owner); returns fresh tokens",
  })
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createHouseholdSchema)) body: CreateHouseholdInput,
  ): Promise<HouseholdJoinResult> {
    return this.households.create(user.id, body);
  }

  @Get()
  @ApiOperation({ summary: "List households the caller is a member of" })
  list(@CurrentUser() user: AuthUser): Promise<HouseholdResponse[]> {
    return this.households.list(user.id);
  }

  @Get(":householdId")
  @ApiOperation({ summary: "Get a household the caller belongs to" })
  get(
    @CurrentUser() user: AuthUser,
    @Param("householdId", new ZodValidationPipe(objectIdSchema))
    householdId: string,
  ): Promise<HouseholdResponse> {
    return this.households.get(householdId, user.id);
  }

  @Patch(":householdId")
  @ApiOperation({ summary: "Rename a household (owner/admin only)" })
  update(
    @CurrentUser() user: AuthUser,
    @Param("householdId", new ZodValidationPipe(objectIdSchema))
    householdId: string,
    @Body(new ZodValidationPipe(updateHouseholdSchema)) body: UpdateHouseholdInput,
  ): Promise<HouseholdResponse> {
    return this.households.update(householdId, user.id, body);
  }

  @Delete(":householdId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete a household (owner only)" })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param("householdId", new ZodValidationPipe(objectIdSchema))
    householdId: string,
  ): Promise<{ deleted: boolean }> {
    await this.households.remove(householdId, user.id);
    return { deleted: true };
  }

  @Get(":householdId/members")
  @ApiOperation({ summary: "List a household's active members" })
  listMembers(
    @CurrentUser() user: AuthUser,
    @Param("householdId", new ZodValidationPipe(objectIdSchema))
    householdId: string,
  ): Promise<HouseholdMemberResponse[]> {
    return this.households.listMembers(householdId, user.id);
  }

  @Patch(":householdId/members/:memberId")
  @ApiOperation({ summary: "Change a member's role (owner/admin only)" })
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param("householdId", new ZodValidationPipe(objectIdSchema))
    householdId: string,
    @Param("memberId", new ZodValidationPipe(objectIdSchema)) memberId: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) body: UpdateMemberInput,
  ): Promise<HouseholdMemberResponse> {
    return this.households.updateMemberRole(householdId, user.id, memberId, body);
  }

  @Delete(":householdId/members/:memberId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove a member (owner/admin) or leave (self)" })
  async removeMember(
    @CurrentUser() user: AuthUser,
    @Param("householdId", new ZodValidationPipe(objectIdSchema))
    householdId: string,
    @Param("memberId", new ZodValidationPipe(objectIdSchema)) memberId: string,
  ): Promise<{ removed: boolean }> {
    await this.households.removeMember(householdId, user.id, memberId);
    return { removed: true };
  }

  @Post(":householdId/invites")
  @ApiOperation({ summary: "Create a join invite code (owner/admin only)" })
  createInvite(
    @CurrentUser() user: AuthUser,
    @Param("householdId", new ZodValidationPipe(objectIdSchema))
    householdId: string,
    @Body(new ZodValidationPipe(createInviteSchema)) body: CreateInviteInput,
  ): Promise<HouseholdInviteResponse> {
    return this.households.createInvite(householdId, user.id, body);
  }

  @Get(":householdId/invites")
  @ApiOperation({ summary: "List pending invites (owner/admin only)" })
  listInvites(
    @CurrentUser() user: AuthUser,
    @Param("householdId", new ZodValidationPipe(objectIdSchema))
    householdId: string,
  ): Promise<HouseholdInviteResponse[]> {
    return this.households.listInvites(householdId, user.id);
  }

  @Delete(":householdId/invites/:inviteId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revoke a pending invite (owner/admin only)" })
  async revokeInvite(
    @CurrentUser() user: AuthUser,
    @Param("householdId", new ZodValidationPipe(objectIdSchema))
    householdId: string,
    @Param("inviteId", new ZodValidationPipe(objectIdSchema)) inviteId: string,
  ): Promise<{ revoked: boolean }> {
    await this.households.revokeInvite(householdId, user.id, inviteId);
    return { revoked: true };
  }
}
