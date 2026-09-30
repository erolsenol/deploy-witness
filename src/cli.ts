#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { ConfigLoadError, loadConfig } from "./config/load.js";
import { runVerification } from "./core/verify.js";

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

program
  .command("config")
  .description("Configuration commands")
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

program
  .command("verify")
  .description("Verify a deployment and configured runtime probes.")
  .option("-c, --config <path>", "configuration file", "deploy-witness.yml")
  .option("--expected-sha <sha>", "expected full commit SHA")
  .option("--report <path>", "write JSON evidence report")
  .action(
    async (options: {
      config: string;
      expectedSha?: string;
      report?: string;
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
        const report = await runVerification({ config, token, expectedSha });
        if (options.report)
          await writeFile(
            options.report,
            `${JSON.stringify(report, null, 2)}\n`,
            { encoding: "utf8", mode: 0o600 },
          );
        for (const check of report.checks)
          console.log(
            `${check.status.padEnd(11)} ${check.id} — ${check.summary}`,
          );
        console.log(`Decision: ${report.decision} (run ${report.runId})`);
        process.exitCode =
          report.decision === "PASS" ? 0 : report.decision === "FAIL" ? 1 : 3;
      } catch (error) {
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
