import { writeFile } from "node:fs/promises";
import * as core from "@actions/core";
import { loadConfig } from "../config/load.js";
import { runVerification } from "../core/verify.js";

async function main(): Promise<void> {
  const token = core.getInput("coolify-token", { required: true });
  core.setSecret(token);
  const configPath = core.getInput("config", { required: true });
  const config = await loadConfig(configPath);
  const expectedSha =
    core.getInput("expected-sha") ||
    config.deployment.expectedSha ||
    process.env.GITHUB_SHA;
  if (!expectedSha || !/^[a-f0-9]{40,64}$/i.test(expectedSha))
    throw new Error("Expected a full commit SHA.");
  const startedAfter =
    core.getInput("started-after") || config.deployment.startedAfter;
  const report = await runVerification({
    config,
    token,
    expectedSha,
    ...(startedAfter ? { startedAfter } : {}),
  });
  const reportPath =
    core.getInput("report-path") || "deploy-witness-report.json";
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  core.setOutput("decision", report.decision);
  core.setOutput("report-path", reportPath);
  await core.summary
    .addHeading(`DeployWitness: ${report.decision}`)
    .addTable([
      [
        { data: "Check", header: true },
        { data: "Status", header: true },
        { data: "Evidence summary", header: true },
      ],
      ...report.checks.map((check) => [check.id, check.status, check.summary]),
    ])
    .write();
  if (report.decision !== "PASS")
    core.setFailed(`Deployment verification decision: ${report.decision}`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Action failed safely.";
  core.setFailed(message);
});
