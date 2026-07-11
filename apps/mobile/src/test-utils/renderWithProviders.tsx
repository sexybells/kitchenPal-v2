import type { ReactElement, ReactNode } from "react";
import { render, type RenderResult } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { createQueryClient } from "../api/query-client";
import { i18n, initI18n } from "../i18n";

// Static safe-area metrics so components using insets render deterministically.
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * Wrap a component in the app providers (i18n, query, safe-area) for tests.
 * `render` is async in RNTL v14 — callers must await this.
 */
export function renderWithProviders(ui: ReactElement): Promise<RenderResult> {
  initI18n("en");
  const queryClient = createQueryClient();

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </I18nextProvider>
    </SafeAreaProvider>
  );

  return render(ui, { wrapper: Wrapper });
}
