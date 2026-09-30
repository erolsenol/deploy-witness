import { describe, expect, it } from "vitest";
import type { HttpProbeConfig } from "../src/contracts/index.js";
import { verifyHttpProbe } from "../src/probes/http.js";

const baseProbe: HttpProbeConfig = {
  name: "health",
  url: "https://app.example.test/api/version",
  required: true,
  expectedStatus: 200,
  timeoutMs: 2_000,
};

describe("HTTP runtime probes", () => {
  it("checks status and a JSON deployment marker without returning the response body", async () => {
    const probe: HttpProbeConfig = {
      ...baseProbe,
      expectedJson: { path: "build.commit", value: "deadbeef" },
    };
    const response = Response.json({
      build: { commit: "deadbeef" },
      apiKey: "do-not-report",
    });
    const result = await verifyHttpProbe(probe, {
      fetchImpl: async () => response,
    });
    expect(result.status).toBe("PASS");
    expect(JSON.stringify(result)).not.toContain("do-not-report");
    expect(
      result.evidence.some(
        (item) =>
          item.field === "json:build.commit:matches" && item.observed === true,
      ),
    ).toBe(true);
  });

  it("does not follow redirects", async () => {
    const result = await verifyHttpProbe(baseProbe, {
      fetchImpl: async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://elsewhere.example.test" },
        }),
    });
    expect(result.status).toBe("FAIL");
    expect(result.failureCode).toBe("HTTP_REDIRECT_BLOCKED");
  });

  it("requires HTTPS except for local development endpoints", async () => {
    const result = await verifyHttpProbe({
      ...baseProbe,
      url: "http://internal.example.test/health",
    });
    expect(result.status).toBe("FAIL");
    expect(result.failureCode).toBe("HTTP_URL_UNSAFE");
  });

  it("fails when the requested runtime commit marker does not match", async () => {
    const result = await verifyHttpProbe(
      { ...baseProbe, expectedJson: { path: "commit", value: "expected" } },
      { fetchImpl: async () => Response.json({ commit: "stale" }) },
    );
    expect(result.status).toBe("FAIL");
  });
});
