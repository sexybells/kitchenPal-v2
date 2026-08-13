import { useEffect, useState, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import type { AdminRecipeResponse } from "@kitchenpal/api-contract";
import { adminApi } from "@/api/admin";
import { ApiClientError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RecipeImageDialogProps {
  recipe: AdminRecipeResponse | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/**
 * Attach (or clear) a recipe's dish photo. Two ways in, both ending at the same
 * `imageUrl` PATCH: upload a file — stored through the backend's storage
 * adapter, so it lands on S3/CDN in production — or paste an existing URL.
 *
 * This is how the seeded system recipes get real photography: they ship with
 * `imageUrl: null` and fall back to the app's dish placeholder until a photo is
 * attached here. The seeder never authors `imageUrl`, so re-seeding preserves
 * whatever is set.
 */
export function RecipeImageDialog({
  recipe,
  onOpenChange,
  onSaved,
}: RecipeImageDialogProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Re-seed the field whenever a different recipe opens the dialog.
  useEffect(() => {
    setUrl(recipe?.imageUrl ?? "");
    setError(null);
  }, [recipe]);

  const upload = useMutation({
    mutationFn: (file: File) => adminApi.uploadRecipeImage(file),
    onSuccess: (result) => {
      setUrl(result.url);
      setError(null);
    },
    onError: (cause: unknown) => setError(toMessage(cause)),
  });

  const save = useMutation({
    mutationFn: (imageUrl: string | null) => {
      if (!recipe) throw new Error("No recipe selected");
      return adminApi.updateRecipe(recipe.id, { imageUrl });
    },
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
    onError: (cause: unknown) => setError(toMessage(cause)),
  });

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      upload.mutate(file);
    }
  }

  const busy = upload.isPending || save.isPending;
  const trimmed = url.trim();

  return (
    <Dialog open={recipe !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dish photo</DialogTitle>
          <DialogDescription>
            {recipe?.name ?? ""} — upload a photo or paste an image URL. Leave
            empty to fall back to the app&apos;s dish placeholder.
          </DialogDescription>
        </DialogHeader>

        {trimmed ? (
          <img
            src={trimmed}
            alt={recipe?.name ?? "Recipe"}
            className="h-40 w-full rounded-md object-cover"
          />
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="recipe-image-file">Upload</Label>
          <Input
            id="recipe-image-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onFileChange}
            disabled={busy}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="recipe-image-url">Image URL</Label>
          <Input
            id="recipe-image-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
            disabled={busy}
          />
        </div>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => save.mutate(null)}
            disabled={busy || !recipe?.imageUrl}
          >
            Remove photo
          </Button>
          <Button
            onClick={() => save.mutate(trimmed.length > 0 ? trimmed : null)}
            disabled={busy}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toMessage(cause: unknown): string {
  return cause instanceof ApiClientError
    ? cause.message
    : "Something went wrong";
}
