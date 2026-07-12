import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  createRecipeSchema,
  mealTypeSchema,
  type CreateRecipeInput,
  type MealType,
} from "@kitchenpal/api-contract";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface RecipeCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

/** Split a textarea into a trimmed, non-empty list (one item per line). */
function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Split a comma-separated field into trimmed, non-empty tags. */
function toTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/**
 * Create a system recipe. The form builds a minimal recipe (name, meal type,
 * tags, timing, ingredient names, and steps) and validates it against the
 * shared contract before sending, so the server sees a well-formed payload.
 */
export function RecipeCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: RecipeCreateDialogProps) {
  const [name, setName] = useState("");
  const [mealType, setMealType] = useState<MealType>("dinner");
  const [tags, setTags] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [servings, setServings] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [steps, setSteps] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: CreateRecipeInput) => adminApi.createRecipe(body),
    onSuccess: () => {
      onCreated();
      onOpenChange(false);
      reset();
    },
    onError: (cause) =>
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Failed to create the recipe.",
      ),
  });

  function reset() {
    setName("");
    setMealType("dinner");
    setTags("");
    setCookTime("");
    setServings("");
    setIngredients("");
    setSteps("");
    setError(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = createRecipeSchema.safeParse({
      name,
      mealType,
      tags: toTags(tags),
      cookTimeMinutes: cookTime ? Number(cookTime) : undefined,
      servings: servings ? Number(servings) : undefined,
      ingredients: toLines(ingredients).map((ingredientName) => ({
        name: ingredientName,
        optional: false,
      })),
      steps: toLines(steps),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid recipe details.");
      return;
    }
    mutation.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New recipe</DialogTitle>
          <DialogDescription>
            Create a system recipe available to every tenant.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recipe-name">Name</Label>
            <Input
              id="recipe-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recipe-meal">Meal</Label>
              <Select
                id="recipe-meal"
                value={mealType}
                onChange={(event) =>
                  setMealType(event.target.value as MealType)
                }
              >
                {mealTypeSchema.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recipe-cook">Cook (min)</Label>
              <Input
                id="recipe-cook"
                type="number"
                min={0}
                value={cookTime}
                onChange={(event) => setCookTime(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recipe-servings">Servings</Label>
              <Input
                id="recipe-servings"
                type="number"
                min={1}
                value={servings}
                onChange={(event) => setServings(event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recipe-tags">Tags (comma separated)</Label>
            <Input
              id="recipe-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="quick, vegetarian"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recipe-ingredients">Ingredients (one per line)</Label>
            <Textarea
              id="recipe-ingredients"
              value={ingredients}
              onChange={(event) => setIngredients(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recipe-steps">Steps (one per line)</Label>
            <Textarea
              id="recipe-steps"
              value={steps}
              onChange={(event) => setSteps(event.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create recipe"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
