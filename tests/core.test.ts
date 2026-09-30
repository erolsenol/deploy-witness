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

  it("verifies a Vercel production deployment with its Git source SHA", async () => {
    const vercelConfig = VerificationConfigSchema.parse({
      version: 1,
      provider: "vercel",
      vercel: {
        projectId: "prj_demo",
        teamId: "team_demo",
        target: "production",
      },
      deployment: { timeoutSeconds: 10, pollIntervalSeconds: 1 },
      probes: [],
    });
    const createdAt = Date.now();
    const fetchImpl = async (input: string | URL | Request) => {
      const url = new URL(
        input instanceof Request ? input.url : input.toString(),
      );
      if (url.pathname === "/v7/deployments") {
        expect(url.searchParams.get("projectId")).toBe("prj_demo");
        expect(url.searchParams.get("teamId")).toBe("team_demo");
        expect(url.searchParams.get("target")).toBe("production");
        return Response.json({
          deployments: [{ uid: "dpl_demo", createdAt }],
        });
      }
      expect(url.pathname).toBe("/v13/deployments/dpl_demo");
      expect(url.searchParams.get("withGitRepoInfo")).toBe("true");
      return Response.json({
        id: "dpl_demo",
        projectId: "prj_demo",
        readyState: "READY",
        target: "production",
        createdAt,
        gitSource: { sha: expectedSha },
      });
    };
    const report = await runVerification({
      config: vercelConfig,
      token: "vercel-read-token",
      expectedSha,
      startedAfter: new Date(createdAt - 1_000).toISOString(),
      fetchImpl,
    });

    expect(report.decision).toBe("PASS");
    expect(report.provider).toBe("vercel");
    expect(report.resourceUuid).toBe("prj_demo");
    expect(report.checks.map((check) => check.id)).toEqual([
      "provider.vercel-api",
      "deployment.status",
      "deployment.commit",
      "deployment.freshness",
    ]);
    expect(report.checks.every((check) => check.status === "PASS")).toBe(true);
  });
});
