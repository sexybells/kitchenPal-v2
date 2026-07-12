import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DevToolResult } from "@kitchenpal/api-contract";
import { adminApi } from "@/api/admin";
import { ApiClientError } from "@/api/errors";
import { isDevToolsEnabled } from "@/lib/env";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Developer tools, available OUTSIDE production only. Seeding is safe; the reset
 * is destructive and requires an explicit confirmation step. The backend also
 * fails these closed in production as a second line of defense.
 */
export function DevToolsPage() {
  const queryClient = useQueryClient();
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function report(result: DevToolResult) {
    setError(null);
    setMessage(`${result.action}: ${result.affected} record(s) affected.`);
    void queryClient.invalidateQueries();
  }

  function onError(cause: unknown) {
    setMessage(null);
    setError(
      cause instanceof ApiClientError
        ? cause.message
        : "The action could not be completed.",
    );
  }

  const seedPlans = useMutation({
    mutationFn: adminApi.seedPlans,
    onSuccess: report,
    onError,
  });
  const seedRecipes = useMutation({
    mutationFn: adminApi.seedRecipes,
    onSuccess: report,
    onError,
  });
  const resetData = useMutation({
    mutationFn: adminApi.resetDevData,
    onSuccess: (result) => {
      report(result);
      setConfirmReset(false);
    },
    onError,
  });

  // Fail closed in the UI when not in a dev build (the backend also guards this).
  if (!isDevToolsEnabled()) {
    return (
      <div>
        <PageHeader title="Dev tools" />
        <Card>
          <CardContent className="p-6 text-sm text-text-muted">
            Developer tools are disabled in production.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Dev tools"
        description="Seed and reset development data. Not available in production."
      />

      {message && (
        <p className="mb-4 text-sm text-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="mb-4 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Seed subscription plans</CardTitle>
            <CardDescription>Insert the baseline plan catalog.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              disabled={seedPlans.isPending}
              onClick={() => seedPlans.mutate()}
            >
              Seed plans
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Seed system recipes</CardTitle>
            <CardDescription>Insert the baseline recipe set.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              disabled={seedRecipes.isPending}
              onClick={() => seedRecipes.mutate()}
            >
              Seed recipes
            </Button>
          </CardContent>
        </Card>

        <Card className="border-danger">
          <CardHeader>
            <CardTitle>Reset dev data</CardTitle>
            <CardDescription>
              Delete dev-owned plans, subscriptions, system recipes, and
              settings. Accounts are never touched.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="danger" onClick={() => setConfirmReset(true)}>
              Reset…
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset development data?</DialogTitle>
            <DialogDescription>
              This permanently deletes dev-owned data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={resetData.isPending}
              onClick={() => resetData.mutate()}
            >
              {resetData.isPending ? "Resetting…" : "Yes, reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
