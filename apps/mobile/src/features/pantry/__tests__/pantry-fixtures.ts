import type {
  PantryDetection,
  PantryItemResponse,
  PantryScanResponse,
} from "@kitchenpal/api-contract";

/** Build a pantry item for tests, overriding only what a case cares about. */
export const makeItem = (
  overrides: Partial<PantryItemResponse> = {},
): PantryItemResponse => ({
  id: "item-1",
  name: "Eggs",
  category: "dairy",
  quantity: 6,
  unit: "pcs",
  stockState: "plenty",
  trackingMode: "exact",
  confidenceState: "confirmed",
  source: "manual",
  expiryDate: null,
  scope: "personal",
  version: 1,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  ...overrides,
});

export const makeDetection = (
  overrides: Partial<PantryDetection> = {},
): PantryDetection => ({
  name: "Tomato",
  category: "produce",
  quantity: 2,
  unit: "pcs",
  stockState: "some",
  confidence: 0.9,
  confidenceState: "estimated",
  lowConfidence: false,
  ...overrides,
});

export const makeScan = (
  overrides: Partial<PantryScanResponse> = {},
): PantryScanResponse => ({
  id: "scan-1",
  status: "ready",
  provider: "openai",
  imageUrl: null,
  detections: [makeDetection()],
  degraded: false,
  materializedItemIds: [],
  error: null,
  version: 1,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  ...overrides,
});
