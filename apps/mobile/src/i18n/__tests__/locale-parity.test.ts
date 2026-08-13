import { en } from "../locales/en";
import { vi } from "../locales/vi";

/** Flatten a nested translation bundle into sorted dotted key paths. */
const keyPaths = (bundle: unknown, prefix = ""): string[] => {
  if (typeof bundle !== "object" || bundle === null) return [prefix];
  return Object.entries(bundle as Record<string, unknown>)
    .flatMap(([key, value]) =>
      keyPaths(value, prefix ? `${prefix}.${key}` : key),
    )
    .sort();
};

describe("i18n locale parity", () => {
  it("en and vi expose the exact same key paths", () => {
    expect(keyPaths(en)).toEqual(keyPaths(vi));
  });

  it("includes the new community keys in both bundles", () => {
    const paths = keyPaths(vi);
    expect(paths).toContain("tabs.community");
    expect(paths).toContain("community.title");
    expect(paths).toContain("community.reportReason.spam");
  });
});
