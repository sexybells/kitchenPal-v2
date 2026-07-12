import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminUserResponse, Role } from "@kitchenpal/api-contract";
import { adminApi } from "@/api/admin";
import { ApiClientError } from "@/api/errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatVnd } from "@/lib/format";

interface UserManageDialogProps {
  user: AdminUserResponse | null;
  onClose: () => void;
  onChanged: () => void;
}

/**
 * Manage a single user: toggle the admin role, suspend/reinstate, and assign or
 * cancel their subscription (source=admin). Subscription assignment is the only
 * path to Pro in v1, so it lives here rather than in a self-serve flow.
 */
export function UserManageDialog({
  user,
  onClose,
  onChanged,
}: UserManageDialogProps) {
  const queryClient = useQueryClient();
  const [planId, setPlanId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const plans = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: adminApi.listPlans,
    enabled: user !== null,
  });

  // Default the plan picker to the first active plan when plans load.
  useEffect(() => {
    if (!planId && plans.data && plans.data.length > 0) {
      setPlanId(plans.data[0]!.id);
    }
  }, [plans.data, planId]);

  function afterChange() {
    setError(null);
    void queryClient.invalidateQueries({ queryKey: ["users"] });
    onChanged();
  }

  function onError(cause: unknown) {
    setError(
      cause instanceof ApiClientError
        ? cause.message
        : "The action could not be completed.",
    );
  }

  const isAdmin = user?.roles.includes("admin") ?? false;

  const roleMutation = useMutation({
    mutationFn: (nextIsAdmin: boolean) => {
      const roles: Role[] = nextIsAdmin ? ["user", "admin"] : ["user"];
      return adminApi.updateUserRoles(user!.id, roles);
    },
    onSuccess: afterChange,
    onError,
  });

  const suspendMutation = useMutation({
    mutationFn: (suspend: boolean) => adminApi.suspendUser(user!.id, suspend),
    onSuccess: afterChange,
    onError,
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      adminApi.assignSubscription({ userId: user!.id, planId }),
    onSuccess: afterChange,
    onError,
  });

  const cancelMutation = useMutation({
    mutationFn: () => adminApi.cancelSubscription(user!.id),
    onSuccess: afterChange,
    onError,
  });

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {user && (
          <>
            <DialogHeader>
              <DialogTitle>{user.displayName}</DialogTitle>
              <DialogDescription>{user.email ?? user.phone}</DialogDescription>
            </DialogHeader>

            <section className="flex items-center justify-between border-t border-border pt-4">
              <div>
                <Label>Administrator</Label>
                <p className="text-xs text-text-muted">
                  Grants access to this console.
                </p>
              </div>
              <Switch
                checked={isAdmin}
                disabled={roleMutation.isPending}
                onCheckedChange={(next) => roleMutation.mutate(next)}
                aria-label="Toggle administrator role"
              />
            </section>

            <section className="flex items-center justify-between border-t border-border pt-4">
              <div>
                <Label>Account status</Label>
                <p className="text-xs text-text-muted">
                  Suspended users cannot sign in.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {user.suspended ? (
                  <Badge variant="danger">suspended</Badge>
                ) : (
                  <Badge variant="success">active</Badge>
                )}
                <Button
                  variant={user.suspended ? "outline" : "danger"}
                  size="sm"
                  disabled={suspendMutation.isPending}
                  onClick={() => suspendMutation.mutate(!user.suspended)}
                >
                  {user.suspended ? "Reinstate" : "Suspend"}
                </Button>
              </div>
            </section>

            <section className="border-t border-border pt-4">
              <Label htmlFor="assign-plan">Subscription</Label>
              <p className="mb-2 text-xs text-text-muted">
                Assign a plan (source=admin) or cancel the active one.
              </p>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Select
                    id="assign-plan"
                    value={planId}
                    onChange={(event) => setPlanId(event.target.value)}
                    disabled={plans.isLoading || !plans.data?.length}
                  >
                    {plans.data?.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} · {plan.tier} · {formatVnd(plan.priceVnd)}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  size="sm"
                  disabled={!planId || assignMutation.isPending}
                  onClick={() => assignMutation.mutate()}
                >
                  Assign
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate()}
                >
                  Cancel
                </Button>
              </div>
            </section>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
