#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import {
  ConfigLoadError,
  loadConfig,
  loadConfigDetails,
} from "./config/load.js";
import { runVerification } from "./core/verify.js";
import { renderJUnit } from "./reporters/junit.js";

const program = new Command()
  .name("deploy-witness")
  .description("Verify that the expected commit is live after deployment.")
  .version("0.1.0");
const template = `version: 1\nprovider: coolify\ncoolify:\n  baseUrl: https://coolify.example.com\n  resourceUuid: replace-with-resource-uuid\ndeployment:\n  timeoutSeconds: 600\n  pollIntervalSeconds: 5\nprobes: []\n`;

program
  .command("init")
  .description(
    "Create a starter configuration without overwriting existing files.",
  )
  .option("-o, --output <path>", "output path", "deploy-witness.yml")
  .action(async ({ output }: { output: string }) => {
    try {
      await writeFile(output, template, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      console.log(`Created ${output}`);
    } catch {
      console.error(
        "Could not create configuration (the path may already exist).",
      );
      process.exitCode = 2;
    }
  });

const configCommand = program
  .command("config")
  .description("Configuration commands");

configCommand
  .command("validate")
  .argument("[path]", "configuration file", "deploy-witness.yml")
  .action(async (path: string) => {
    try {
      await loadConfig(path);
      console.log("Configuration is valid.");
    } catch (error) {
      console.error(
        error instanceof ConfigLoadError
          ? `${error.code}: ${error.message}`
          : "CONFIG_INVALID: Configuration could not be validated.",
      );
      process.exitCode = 2;
    }
  });

configCommand
  .command("explain")
  .description("Show the effective configuration source and planned checks.")
  .argument("[path]", "configuration file", "deploy-witness.yml")
  .action(async (path: string) => {
    try {
      const loaded = await loadConfigDetails(path);
      const probeIds = loaded.config.probes.map((probe) => {
        const id = probe.name
          .toLowerCase()
          .replace(/[^a-z0-9.-]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 48);
        return `http.${id || "probe"}`;
      });
      console.log(`Configuration source: ${loaded.path}`);
      console.log(
        "Precedence: CLI options > DEPLOY_WITNESS_* environment > config file > CI defaults",
      );
      console.log(
        `Applied environment overrides: ${loaded.appliedOverrides.join(", ") || "none"}`,
      );
      console.log("Planned checks:");
      for (const id of [
        "provider.coolify-api",
        "deployment.status",
        "deployment.commit",
        "deployment.freshness",
        ...probeIds,
      ]) {
        console.log(`  - ${id}`);
      }
      console.log(
        "Configuration values and secret values are intentionally not displayed.",
      );
    } catch (error) {
      console.error(
        error instanceof ConfigLoadError
          ? `${error.code}: ${error.message}`
          : "CONFIG_INVALID: Configuration could not be inspected.",
      );
      process.exitCode = 2;
    }
  });

program
  .command("verify")
  .description("Verify a deployment and configured runtime probes.")
  .option("-c, --config <path>", "configuration file", "deploy-witness.yml")
  .option("--expected-sha <sha>", "expected full commit SHA")
  .option(
    "--started-after <timestamp>",
    "deployment-run boundary timestamp (ISO 8601)",
  )
  .option("--report <path>", "write JSON evidence report")
  .option("--junit <path>", "write JUnit XML check results")
  .action(
    async (options: {
      config: string;
      expectedSha?: string;
      startedAfter?: string;
      report?: string;
      junit?: string;
    }) => {
      try {
        const config = await loadConfig(options.config);
        const expectedSha =
          options.expectedSha ??
          config.deployment.expectedSha ??
          process.env.GITHUB_SHA;
        if (!expectedSha || !/^[a-f0-9]{40,64}$/i.test(expectedSha)) {
          console.error(
            "EXPECTED_SHA_INVALID: Provide a full 40–64 character commit SHA.",
          );
          process.exitCode = 2;
          return;
        }
        const token = process.env.COOLIFY_API_TOKEN;
        if (!token) {
          console.error(
            "COOLIFY_TOKEN_MISSING: Set COOLIFY_API_TOKEN in the environment.",
          );
          process.exitCode = 2;
          return;
        }
        const report = await runVerification({
          config,
          token,
          expectedSha,
          ...(options.startedAfter
            ? { startedAfter: options.startedAfter }
            : {}),
        });
        if (options.report)
          await writeFile(
            options.report,
            `${JSON.stringify(report, null, 2)}\n`,
            { encoding: "utf8", mode: 0o600 },
          );
        if (options.junit)
          await writeFile(options.junit, renderJUnit(report), {
            encoding: "utf8",
            mode: 0o600,
          });
        for (const check of report.checks)
          console.log(
            `${check.status.padEnd(11)} ${check.id} — ${check.summary}`,
          );
        console.log(`Decision: ${report.decision} (run ${report.runId})`);
        process.exitCode =
          report.decision === "PASS" ? 0 : report.decision === "FAIL" ? 1 : 3;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "STARTED_AFTER_INVALID"
        ) {
          console.error(
            "STARTED_AFTER_INVALID: Provide a valid ISO 8601 timestamp with a timezone.",
          );
          process.exitCode = 2;
          return;
        }
        console.error(
          error instanceof ConfigLoadError
            ? `${error.code}: ${error.message}`
            : "VERIFY_FAILED: Verification could not be completed safely.",
        );
        process.exitCode = error instanceof ConfigLoadError ? 2 : 3;
      }
    },
  );

program.parseAsync().catch(() => {
  console.error(
    `COMMAND_FAILED: Could not run command (reference ${randomUUID()}).`,
  );
  process.exitCode = 2;
});
