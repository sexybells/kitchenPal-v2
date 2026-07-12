import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  createPlanSchema,
  subscriptionTierSchema,
  type SubscriptionPlanResponse,
  type SubscriptionTier,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface PlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit that plan; absent = create a new plan. */
  plan?: SubscriptionPlanResponse | null;
  onSaved: () => void;
}

function toFeatures(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Create or edit a subscription plan. Validated against the shared contract. */
export function PlanFormDialog({
  open,
  onOpenChange,
  plan,
  onSaved,
}: PlanFormDialogProps) {
  const isEdit = Boolean(plan);
  const [name, setName] = useState(plan?.name ?? "");
  const [tier, setTier] = useState<SubscriptionTier>(plan?.tier ?? "pro");
  const [priceVnd, setPriceVnd] = useState(String(plan?.priceVnd ?? 0));
  const [features, setFeatures] = useState((plan?.features ?? []).join("\n"));
  const [active, setActive] = useState(plan?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        tier,
        priceVnd: Number(priceVnd),
        features: toFeatures(features),
        active,
      };
      const parsed = createPlanSchema.safeParse(payload);
      if (!parsed.success) {
        throw new ApiClientError({
          code: "VALIDATION",
          message: parsed.error.issues[0]?.message ?? "Invalid plan details.",
          status: 0,
        });
      }
      return isEdit
        ? adminApi.updatePlan(plan!.id, parsed.data)
        : adminApi.createPlan(parsed.data);
    },
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
    onError: (cause) =>
      setError(
        cause instanceof ApiClientError
          ? cause.message
          : "Failed to save the plan.",
      ),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit plan" : "New plan"}</DialogTitle>
          <DialogDescription>
            Prices are in Vietnamese dong (VND).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-name">Name</Label>
            <Input
              id="plan-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan-tier">Tier</Label>
              <Select
                id="plan-tier"
                value={tier}
                onChange={(event) =>
                  setTier(event.target.value as SubscriptionTier)
                }
              >
                {subscriptionTierSchema.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan-price">Price (VND)</Label>
              <Input
                id="plan-price"
                type="number"
                min={0}
                value={priceVnd}
                onChange={(event) => setPriceVnd(event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-features">Features (one per line)</Label>
            <Textarea
              id="plan-features"
              value={features}
              onChange={(event) => setFeatures(event.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="plan-active">Active</Label>
            <Switch
              id="plan-active"
              checked={active}
              onCheckedChange={setActive}
              aria-label="Plan active"
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
              {mutation.isPending ? "Saving…" : "Save plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
