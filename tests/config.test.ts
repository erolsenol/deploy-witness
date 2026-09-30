import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigLoadError, loadConfig } from "../src/config/load.js";

const dirs: string[] = [];
async function configFile(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "deploy-witness-"));
  dirs.push(dir);
  const path = join(dir, "deploy-witness.yml");
  await writeFile(path, content);
  return path;
}

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("configuration loading", () => {
  it("loads a valid strict configuration", async () => {
    const config = await loadConfig(
      await configFile(
        `version: 1\nprovider: coolify\ncoolify:\n  baseUrl: https://coolify.example.test\n  resourceUuid: app-1\ndeployment:\n  expectedSha: ${"a".repeat(40)}\n`,
      ),
    );
    expect(config.deployment.timeoutSeconds).toBe(600);
    expect(config.probes).toEqual([]);
  });

  it("rejects unknown credential fields without echoing their value", async () => {
    const path = await configFile(
      `version: 1\nprovider: coolify\ncoolify:\n  baseUrl: https://coolify.example.test\n  resourceUuid: app-1\ndeployment:\n  token: super-secret-value\n`,
    );
    await expect(loadConfig(path)).rejects.toMatchObject({
      code: "CONFIG_INVALID",
    });
    await expect(loadConfig(path)).rejects.not.toThrow("super-secret-value");
  });

  it("rejects malformed YAML with a value-free error", async () => {
    await expect(
      loadConfig(await configFile("provider: [")),
    ).rejects.toMatchObject({ code: "CONFIG_YAML_INVALID" });
  });

  it("rejects sensitive response marker headers", async () => {
    const path = await configFile(
      `version: 1\nprovider: coolify\ncoolify:\n  baseUrl: https://coolify.example.test\n  resourceUuid: app-1\ndeployment: {}\nprobes:\n  - name: health\n    url: https://app.example.test/health\n    expectedHeader:\n      name: Set-Cookie\n      value: private\n`,
    );
    await expect(loadConfig(path)).rejects.toBeInstanceOf(ConfigLoadError);
  });
});
