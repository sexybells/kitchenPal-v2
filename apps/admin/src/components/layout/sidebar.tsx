import { NavLink } from "react-router-dom";
import { ChefHat } from "lucide-react";
import { navSections } from "./nav-items";
import { isDevToolsEnabled } from "@/lib/env";
import { cn } from "@/lib/cn";

/** Left navigation. Dev-only entries are filtered out in production builds. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const devEnabled = isDevToolsEnabled();

  return (
    <nav className="flex h-full w-64 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2 px-6 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-text-inverse">
          <ChefHat className="h-5 w-5" />
        </span>
        <div className="leading-tight">
          <p className="font-semibold text-text">KitchenPal</p>
          <p className="text-xs text-text-muted">Admin console</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {navSections.map((section) => {
          const items = section.items.filter(
            (item) => !item.devOnly || devEnabled,
          );
          if (items.length === 0) return null;
          return (
            <div key={section.title} className="mb-4">
              <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-subtle">
                {section.title}
              </p>
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === "/"}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary-soft text-primary"
                            : "text-text-muted hover:bg-surface-alt hover:text-text",
                        )
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
