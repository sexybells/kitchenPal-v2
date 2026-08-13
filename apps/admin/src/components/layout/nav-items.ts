import {
  Boxes,
  CreditCard,
  FileStack,
  Gauge,
  Home,
  ImageIcon,
  ListChecks,
  MessagesSquare,
  ScanLine,
  Settings,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** When true, only shown outside production (dev tooling). */
  devOnly?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/** Sidebar navigation, grouped by concern. Order defines display order. */
export const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      { to: "/", label: "Dashboard", icon: Home },
      { to: "/reports", label: "Reports", icon: Gauge },
    ],
  },
  {
    title: "Manage",
    items: [
      { to: "/users", label: "Users", icon: Users },
      { to: "/households", label: "Households", icon: Boxes },
      { to: "/recipes", label: "Recipes", icon: ListChecks },
      { to: "/community", label: "Cộng đồng", icon: MessagesSquare },
      { to: "/scans", label: "Pantry scans", icon: ScanLine },
      { to: "/uploads", label: "Uploads", icon: ImageIcon },
    ],
  },
  {
    title: "Monetization",
    items: [
      { to: "/subscriptions", label: "Subscriptions", icon: CreditCard },
    ],
  },
  {
    title: "Logs",
    items: [
      { to: "/logs/ai", label: "AI logs", icon: Sparkles },
      { to: "/logs/external-search", label: "External search", icon: FileStack },
      { to: "/logs/audit", label: "Audit logs", icon: ListChecks },
    ],
  },
  {
    title: "System",
    items: [
      { to: "/settings", label: "Settings", icon: Settings },
      { to: "/dev-tools", label: "Dev tools", icon: Wrench, devOnly: true },
    ],
  },
];
