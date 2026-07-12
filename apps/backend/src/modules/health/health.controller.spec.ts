import { ServiceUnavailableException } from "@nestjs/common";
import { HealthController } from "./health.controller";
import type { HealthReport, HealthService } from "./health.service";

function createHealthService(report: HealthReport): HealthService {
  return { check: () => report } as unknown as HealthService;
}

describe("HealthController", () => {
  it("check() returns the report as-is even when degraded (plain liveness)", () => {
    const report: HealthReport = {
      status: "degraded",
      uptimeSeconds: 5,
      mongo: "disconnected",
    };
    const controller = new HealthController(createHealthService(report));
    expect(controller.check()).toEqual(report);
  });

  it("ready() returns the report when Mongo is connected", () => {
    const report: HealthReport = { status: "ok", uptimeSeconds: 5, mongo: "connected" };
    const controller = new HealthController(createHealthService(report));
    expect(controller.ready()).toEqual(report);
  });

  it("ready() throws ServiceUnavailableException (503) so the platform stops routing traffic when Mongo is down", () => {
    const report: HealthReport = {
      status: "degraded",
      uptimeSeconds: 5,
      mongo: "disconnected",
    };
    const controller = new HealthController(createHealthService(report));

    expect(() => controller.ready()).toThrow(ServiceUnavailableException);
    try {
      controller.ready();
      fail("expected ready() to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      const exception = error as ServiceUnavailableException;
      expect(exception.getStatus()).toBe(503);
      expect(exception.getResponse()).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    }
  });
});
