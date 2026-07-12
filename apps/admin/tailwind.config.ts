import type { Config } from "tailwindcss";
import { tailwindPreset } from "@kitchenpal/design-tokens";
import animate from "tailwindcss-animate";

/**
 * Tailwind config for the admin console. All colors, spacing, radius, type, and
 * shadow come from the shared design-token preset so the admin looks like the
 * same product as the mobile app. No ad-hoc hex belongs in this file.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  presets: [tailwindPreset],
  plugins: [animate],
} satisfies Config;
