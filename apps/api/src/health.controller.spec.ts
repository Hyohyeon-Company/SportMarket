import { describe, expect, it } from "vitest";

import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("reports a stable liveness payload without any external dependency", () => {
    const controller = new HealthController();

    expect(controller.read()).toEqual({
      status: "ok",
      service: "sportmarket-api",
    });
  });
});
