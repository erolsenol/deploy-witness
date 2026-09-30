import { describe, expect, it, vi } from "vitest";
import {
  type CoolifyApiError,
  CoolifyClient,
} from "../src/providers/coolify/client.js";
import {
  normalizeCoolifyStatus,
  verifyCoolifyDeployment,
} from "../src/providers/coolify/verify.js";

const sha = "0123456789abcdef0123456789abcdef01234567";

function deployment(
  status: string,
  commit = sha,
  createdAt = "2026-09-30T09:00:00Z",
) {
  return {
    deployment_uuid: "deployment-1",
    status,
    commit,
    created_at: createdAt,
  };
}

describe("Coolify API client", () => {
  it("requests application deployments with a read-only bearer GET", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json([]));
    const client = new CoolifyClient({
      baseUrl: "https://coolify.example.test",
      resourceUuid: "resource-1",
      token: "read-only-token",
      fetchImpl,
    });

    await client.listApplicationDeployments();
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://coolify.example.test/api/v1/deployments/applications/resource-1?skip=0&take=20",
    );
    expect(init?.method).toBe("GET");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer read-only-token",
    );
    expect(init?.redirect).toBe("error");
  });

  it("rejects insecure non-local provider URLs", () => {
    expect(
      () =>
        new CoolifyClient({
          baseUrl: "http://coolify.example.test",
          resourceUuid: "r",
          token: "t",
        }),
    ).toThrowError("COOLIFY_HTTPS_REQUIRED");
  });

  it("does not echo provider response bodies in errors", async () => {
    const client = new CoolifyClient({
      baseUrl: "https://coolify.example.test",
      resourceUuid: "resource-1",
      token: "secret-token",
      fetchImpl: async () => new Response("private response", { status: 403 }),
    });
    await expect(client.listApplicationDeployments()).rejects.toMatchObject({
      code: "COOLIFY_FORBIDDEN",
      message: "COOLIFY_FORBIDDEN",
    } satisfies Partial<CoolifyApiError>);
  });
});

describe("Coolify deployment verification", () => {
  it("normalizes only known lifecycle values", () => {
    expect(normalizeCoolifyStatus("finished")).toBe("success");
    expect(normalizeCoolifyStatus("queued")).toBe("pending");
    expect(normalizeCoolifyStatus("mystery-state")).toBe("unknown");
  });

  it("checks the newest deployment SHA, not an older successful record", async () => {
    const fetchImpl = async () =>
      Response.json([
        deployment("finished", sha, "2026-09-29T09:00:00Z"),
        deployment(
          "finished",
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "2026-09-30T09:00:00Z",
        ),
      ]);

    const checks = await verifyCoolifyDeployment({
      baseUrl: "https://coolify.example.test",
      resourceUuid: "resource-1",
      token: "token",
      expectedSha: sha,
      timeoutSeconds: 30,
      pollIntervalSeconds: 1,
      fetchImpl,
    });

    expect(checks.find((item) => item.id === "deployment.status")?.status).toBe(
      "PASS",
    );
    expect(checks.find((item) => item.id === "deployment.commit")?.status).toBe(
      "FAIL",
    );
  });

  it("fails closed on unknown provider statuses", async () => {
    const checks = await verifyCoolifyDeployment({
      baseUrl: "https://coolify.example.test",
      resourceUuid: "resource-1",
      token: "token",
      expectedSha: sha,
      timeoutSeconds: 30,
      pollIntervalSeconds: 1,
      fetchImpl: async () =>
        Response.json([deployment("finished-but-not-documented")]),
    });
    expect(checks.find((item) => item.id === "deployment.status")?.status).toBe(
      "UNKNOWN",
    );
  });

  it("waits for a queued deployment and then verifies its terminal result", async () => {
    let now = 0;
    let calls = 0;
    const checks = await verifyCoolifyDeployment({
      baseUrl: "https://coolify.example.test",
      resourceUuid: "resource-1",
      token: "token",
      expectedSha: sha,
      timeoutSeconds: 10,
      pollIntervalSeconds: 1,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
      fetchImpl: async () => {
        calls += 1;
        return Response.json([deployment(calls === 1 ? "queued" : "finished")]);
      },
    });
    expect(calls).toBe(2);
    expect(checks.every((item) => item.status === "PASS")).toBe(true);
  });
});
