import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { createQueryClient } from "@/api/query-client";
import { RequireAdmin } from "@/auth/require-admin";
import { AppShell } from "@/components/layout/app-shell";
import { LoginPage } from "@/features/auth/login-page";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { UsersPage } from "@/features/users/users-page";
import { HouseholdsPage } from "@/features/households/households-page";
import { RecipesPage } from "@/features/recipes/recipes-page";
import { CommunityReportsPage } from "@/features/community/community-reports-page";
import { ScansPage } from "@/features/scans/scans-page";
import { UploadsPage } from "@/features/uploads/uploads-page";
import { AiLogsPage } from "@/features/logs/ai-logs-page";
import { ExternalSearchLogsPage } from "@/features/logs/external-search-logs-page";
import { AuditLogsPage } from "@/features/logs/audit-logs-page";
import { SubscriptionsPage } from "@/features/subscriptions/subscriptions-page";
import { ReportsPage } from "@/features/reports/reports-page";
import { SettingsPage } from "@/features/settings/settings-page";
import { DevToolsPage } from "@/features/dev-tools/dev-tools-page";

/**
 * Application root: wires the query client, the router, and the authenticated
 * shell. Every non-login route is guarded by {@link RequireAdmin}; unknown
 * paths fall back to the dashboard.
 */
export function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAdmin>
                <AppShell />
              </RequireAdmin>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/households" element={<HouseholdsPage />} />
            <Route path="/recipes" element={<RecipesPage />} />
            <Route path="/community" element={<CommunityReportsPage />} />
            <Route path="/scans" element={<ScansPage />} />
            <Route path="/uploads" element={<UploadsPage />} />
            <Route path="/subscriptions" element={<SubscriptionsPage />} />
            <Route path="/logs/ai" element={<AiLogsPage />} />
            <Route
              path="/logs/external-search"
              element={<ExternalSearchLogsPage />}
            />
            <Route path="/logs/audit" element={<AuditLogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/dev-tools" element={<DevToolsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
