import { describe, expect, it } from "vitest";
import { VerificationConfigSchema } from "../src/contracts/index.js";
import { runVerification } from "../src/core/verify.js";

const expectedSha = "a".repeat(40);
const config = VerificationConfigSchema.parse({
  version: 1,
  provider: "coolify",
  coolify: {
    baseUrl: "https://coolify.example.test",
    resourceUuid: "application-1",
  },
  deployment: {},
  probes: [],
});

function coolifyResponse() {
  return Response.json([
    {
      deployment_uuid: "deployment-1",
      status: "finished",
      commit: expectedSha,
      created_at: new Date().toISOString(),
    },
  ]);
}

describe("verification orchestration", () => {
  it("keeps an uncorrelated freshness warning visible without turning it into a required failure", async () => {
    const report = await runVerification({
      config,
      token: "read-only-token",
      expectedSha,
      fetchImpl: async () => coolifyResponse(),
    });
    expect(report.decision).toBe("PASS");
    expect(
      report.checks.find((check) => check.id === "deployment.freshness"),
    ).toMatchObject({
      required: false,
      status: "WARN",
    });
  });

  it("fails the overall decision when the current run boundary is later than the deployment", async () => {
    const report = await runVerification({
      config,
      token: "read-only-token",
      expectedSha,
      startedAfter: new Date(Date.now() + 60_000).toISOString(),
      fetchImpl: async () => coolifyResponse(),
    });
    expect(report.decision).toBe("FAIL");
    expect(
      report.checks.find((check) => check.id === "deployment.freshness")
        ?.failureCode,
    ).toBe("DEPLOYMENT_STALE");
  });
});
