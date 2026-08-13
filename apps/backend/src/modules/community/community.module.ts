import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { AuthModule } from "../auth/auth.module";
import { RecipesModule } from "../recipes/recipes.module";
import { CommunityController } from "./community.controller";
import { CommunityCommentRepository } from "./repositories/community-comment.repository";
import { CommunityPostRepository } from "./repositories/community-post.repository";
import { CommunityPostLikeRepository } from "./repositories/community-post-like.repository";
import { CommunityReportRepository } from "./repositories/community-report.repository";
import { CommunityUserBlockRepository } from "./repositories/community-user-block.repository";
import {
  CommunityPost,
  CommunityPostSchema,
} from "./schemas/community-post.schema";
import {
  CommunityPostComment,
  CommunityPostCommentSchema,
} from "./schemas/community-post-comment.schema";
import {
  CommunityPostLike,
  CommunityPostLikeSchema,
} from "./schemas/community-post-like.schema";
import {
  CommunityReport,
  CommunityReportSchema,
} from "./schemas/community-report.schema";
import {
  CommunityUserBlock,
  CommunityUserBlockSchema,
} from "./schemas/community-user-block.schema";
import { CommunityService } from "./services/community.service";

/**
 * Community feed module: public posts, likes, flat comments, moderation
 * reports, and user blocks/profiles. Reuses AuthModule's UserRepository to
 * denormalize author identity and RecipesModule's RecipeRepository to resolve an
 * attached recipe's title. Its repositories are exported so the admin console
 * can moderate the same content (list reports, remove posts/comments).
 */
@Module({
  imports: [
    AuthModule,
    RecipesModule,
    MongooseModule.forFeature([
      { name: CommunityPost.name, schema: CommunityPostSchema },
      { name: CommunityPostLike.name, schema: CommunityPostLikeSchema },
      { name: CommunityPostComment.name, schema: CommunityPostCommentSchema },
      { name: CommunityReport.name, schema: CommunityReportSchema },
      { name: CommunityUserBlock.name, schema: CommunityUserBlockSchema },
    ]),
  ],
  controllers: [CommunityController],
  providers: [
    CommunityService,
    CommunityPostRepository,
    CommunityPostLikeRepository,
    CommunityCommentRepository,
    CommunityReportRepository,
    CommunityUserBlockRepository,
  ],
  exports: [
    CommunityPostRepository,
    CommunityCommentRepository,
    CommunityReportRepository,
  ],
})
export class CommunityModule {}
