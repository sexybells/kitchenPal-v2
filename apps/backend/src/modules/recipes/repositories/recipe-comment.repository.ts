import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { FilterQuery, HydratedDocument } from "mongoose";
import { Model, Types } from "mongoose";
import { ScopedRepository } from "../../../common/database/base.repository";
import type { ScopedDocumentFields } from "../../../common/database/base.schema";
import type { ScopeContext } from "../../../common/scope/scope-context";
import { RecipeComment } from "../schemas/recipe-comment.schema";

export type RecipeCommentEntity = RecipeComment & ScopedDocumentFields;

type CommentDoc = HydratedDocument<RecipeCommentEntity>;

/** Aggregated rating stats for a recipe, across every user's comments. */
export interface RecipeRatingStats {
  averageRating: number;
  reviewCount: number;
}

/**
 * Store for recipe ratings/reviews. A comment is owned (scope-partitioned) so a
 * caller can only create their own, but a recipe's rating aggregates comments
 * from ALL users and any reader may view them — those two reads deliberately
 * span scopes via explicit model-direct queries.
 */
@Injectable()
export class RecipeCommentRepository extends ScopedRepository<RecipeCommentEntity> {
  constructor(
    @InjectModel(RecipeComment.name) model: Model<RecipeCommentEntity>,
  ) {
    super(model);
  }

  /** The caller's own rating on a recipe, if they have already left one. */
  findOwnByRecipe(
    scope: ScopeContext,
    recipeId: string,
  ): Promise<CommentDoc | null> {
    return this.findOne(scope, {
      recipeId,
    } as FilterQuery<RecipeCommentEntity>);
  }

  /** All comments on a recipe (any author), newest first. */
  listByRecipe(recipeId: string): Promise<CommentDoc[]> {
    return this.model
      .find({ recipeId, deletedAt: null })
      .sort({ createdAt: -1 })
      .exec();
  }

  /** Recomputes average rating and count from every comment on the recipe. */
  async ratingStatsFor(recipeId: string): Promise<RecipeRatingStats> {
    const [row] = await this.model
      .aggregate<{ averageRating: number; reviewCount: number }>([
        { $match: { recipeId: new Types.ObjectId(recipeId), deletedAt: null } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            reviewCount: { $sum: 1 },
          },
        },
      ])
      .exec();
    if (!row) {
      return { averageRating: 0, reviewCount: 0 };
    }
    return {
      averageRating: Math.round(row.averageRating * 100) / 100,
      reviewCount: row.reviewCount,
    };
  }
}
