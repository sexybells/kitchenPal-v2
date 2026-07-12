import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "./use-session";

/**
 * Route guard: renders children only for an authenticated admin session.
 * Anyone else is redirected to /login (a non-admin never reaches here because
 * login itself rejects non-admins, but the role is re-checked defensively).
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, accessToken } = useSession();
  const location = useLocation();

  const isAdmin = Boolean(accessToken && user?.roles.includes("admin"));
  if (!isAdmin) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
