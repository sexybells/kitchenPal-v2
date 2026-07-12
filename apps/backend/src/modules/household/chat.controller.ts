import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  markReadSchema,
  messageQuerySchema,
  objectIdSchema,
  sendImageMessageSchema,
  sendTextMessageSchema,
  sendVoteMessageSchema,
  type MarkReadInput,
  type MessageQuery,
  type MessageResponse,
  type SendImageMessageInput,
  type SendTextMessageInput,
  type SendVoteMessageInput,
} from "@kitchenpal/api-contract";
import type { PageResult } from "../../common/http/page-result";
import type { AuthUser } from "../../common/scope/auth-user";
import { CurrentUser } from "../../common/scope/current-user.decorator";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { ChatService } from "./services/chat.service";

/**
 * Household chat over REST (the socket gateway shares the same service). Every
 * route enforces active membership on the `:householdId` before reading or
 * writing, so history and posting are members-only.
 */
@ApiTags("chat")
@ApiBearerAuth()
@Controller("households/:householdId/messages")
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @ApiOperation({ summary: "List a household's messages (newest first)" })
  list(
    @CurrentUser() user: AuthUser,
    @Param("householdId", new ZodValidationPipe(objectIdSchema))
    householdId: string,
    @Query(new ZodValidationPipe(messageQuerySchema)) query: MessageQuery,
  ): Promise<PageResult<MessageResponse>> {
    return this.chat.listMessages(householdId, user.id, query);
  }

  @Post()
  @ApiOperation({ summary: "Post a text message" })
  sendText(
    @CurrentUser() user: AuthUser,
    @Param("householdId", new ZodValidationPipe(objectIdSchema))
    householdId: string,
    @Body(new ZodValidationPipe(sendTextMessageSchema)) body: SendTextMessageInput,
  ): Promise<MessageResponse> {
    return this.chat.sendText(householdId, user.id, body);
  }

  @Post("vote")
  @ApiOperation({ summary: "Post a vote poll" })
  sendVote(
    @CurrentUser() user: AuthUser,
    @Param("householdId", new ZodValidationPipe(objectIdSchema))
    householdId: string,
    @Body(new ZodValidationPipe(sendVoteMessageSchema)) body: SendVoteMessageInput,
  ): Promise<MessageResponse> {
    return this.chat.sendVote(householdId, user.id, body);
  }

  @Post("image")
  @ApiOperation({ summary: "Post an image message (image is uploaded first)" })
  sendImage(
    @CurrentUser() user: AuthUser,
    @Param("householdId", new ZodValidationPipe(objectIdSchema))
    householdId: string,
    @Body(new ZodValidationPipe(sendImageMessageSchema))
    body: SendImageMessageInput,
  ): Promise<MessageResponse> {
    return this.chat.sendImage(householdId, user.id, body);
  }

  @Post("read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark messages as read by the caller" })
  markRead(
    @CurrentUser() user: AuthUser,
    @Param("householdId", new ZodValidationPipe(objectIdSchema))
    householdId: string,
    @Body(new ZodValidationPipe(markReadSchema)) body: MarkReadInput,
  ): Promise<{ marked: number }> {
    return this.chat.markRead(householdId, user.id, body.messageIds);
  }
}
