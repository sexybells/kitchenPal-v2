import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AdminRecipeResponse } from "@kitchenpal/api-contract";
import { renderWithProviders } from "@/test-utils/render";

const uploadRecipeImage = vi.fn();
const updateRecipe = vi.fn();

vi.mock("@/api/admin", () => ({
  adminApi: {
    uploadRecipeImage: (file: File) => uploadRecipeImage(file),
    updateRecipe: (id: string, body: unknown) => updateRecipe(id, body),
  },
}));

import { RecipeImageDialog } from "../recipe-image-dialog";

const RECIPE: AdminRecipeResponse = {
  id: "recipe-1",
  name: "Phở bò",
  imageUrl: null,
  scope: "system",
  ownerUserId: null,
  householdId: null,
  published: true,
  averageRating: 0,
  reviewCount: 0,
  version: 0,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

describe("RecipeImageDialog", () => {
  it("uploads a file and saves the returned URL onto the recipe", async () => {
    uploadRecipeImage.mockResolvedValue({ url: "https://cdn/pho.jpg" });
    updateRecipe.mockResolvedValue({ ...RECIPE, imageUrl: "https://cdn/pho.jpg" });
    const onSaved = vi.fn();

    renderWithProviders(
      <RecipeImageDialog
        recipe={RECIPE}
        onOpenChange={vi.fn()}
        onSaved={onSaved}
      />,
    );

    const file = new File(["bytes"], "pho.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Upload"), {
      target: { files: [file] },
    });

    // The upload fills the URL field; saving then PATCHes the recipe.
    await waitFor(() =>
      expect(screen.getByLabelText("Image URL")).toHaveValue(
        "https://cdn/pho.jpg",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(updateRecipe).toHaveBeenCalledWith("recipe-1", {
        imageUrl: "https://cdn/pho.jpg",
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("clears the photo back to null so the placeholder returns", async () => {
    updateRecipe.mockResolvedValue({ ...RECIPE, imageUrl: null });

    renderWithProviders(
      <RecipeImageDialog
        recipe={{ ...RECIPE, imageUrl: "https://cdn/old.jpg" }}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));

    await waitFor(() =>
      expect(updateRecipe).toHaveBeenCalledWith("recipe-1", { imageUrl: null }),
    );
  });

  it("disables removal when the recipe has no photo to remove", () => {
    renderWithProviders(
      <RecipeImageDialog
        recipe={RECIPE}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Remove photo" })).toBeDisabled();
  });
});
