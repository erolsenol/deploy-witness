import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("CLI configuration commands", () => {
  it("explains effective sources and planned checks without exposing values", async () => {
    const dir = await mkdtemp(join(tmpdir(), "deploy-witness-cli-"));
    dirs.push(dir);
    const path = join(dir, "deploy-witness.yml");
    await writeFile(
      path,
      `version: 1\nprovider: coolify\ncoolify:\n  baseUrl: https://file-target.example.test\n  resourceUuid: private-resource-id\ndeployment:\n  expectedSha: ${"a".repeat(40)}\nprobes:\n  - name: health\n    url: https://runtime.example.test/health\n`,
    );

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli.ts", "config", "explain", path],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          DEPLOY_WITNESS_COOLIFY_BASE_URL:
            "https://environment-target.example.test",
        },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("DEPLOY_WITNESS_COOLIFY_BASE_URL");
    expect(result.stdout).toContain("provider.coolify-api");
    expect(result.stdout).toContain("http.health");
    expect(result.stdout).toContain("Configuration values and secret values");
    expect(result.stdout).not.toContain("private-resource-id");
    expect(result.stdout).not.toContain("environment-target.example.test");
    expect(result.stdout).not.toContain("file-target.example.test");
    expect(result.stdout).not.toContain("a".repeat(40));
  });
});
