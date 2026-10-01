import { writeFile } from "node:fs/promises";
import * as core from "@actions/core";
import { loadConfig } from "../config/load.js";
import { runVerification } from "../core/verify.js";

async function main(): Promise<void> {
  const configPath = core.getInput("config", { required: true });
  const expectedImageDigestInput = core.getInput("expected-image-digest");
  if (
    expectedImageDigestInput !== "" &&
    !/^sha256:[a-f0-9]{64}$/i.test(expectedImageDigestInput)
  ) {
    throw new Error(
      "Expected image digest must be sha256: followed by 64 hexadecimal characters.",
    );
  }
  const configEnv = expectedImageDigestInput
    ? {
        ...process.env,
        DEPLOY_WITNESS_EXPECTED_IMAGE_DIGEST: expectedImageDigestInput,
      }
    : process.env;
  const config = await loadConfig(configPath, { env: configEnv });
  const token = core.getInput(
    config.provider === "coolify" ? "coolify-token" : "vercel-token",
    { required: false },
  );
  if (!token)
    throw new Error(
      config.provider === "coolify"
        ? "Coolify token is required."
        : "Vercel token is required.",
    );
  core.setSecret(token);
  const expectedSha =
    core.getInput("expected-sha") ||
    config.deployment.expectedSha ||
    process.env.GITHUB_SHA;
  if (!expectedSha || !/^[a-f0-9]{40,64}$/i.test(expectedSha))
    throw new Error("Expected a full commit SHA.");
  const startedAfter =
    core.getInput("started-after") || config.deployment.startedAfter;
  const expectedImageDigest =
    expectedImageDigestInput ||
    process.env.DEPLOY_WITNESS_EXPECTED_IMAGE_DIGEST ||
    ("expectedImageDigest" in config.deployment
      ? config.deployment.expectedImageDigest
      : undefined);
  if (
    expectedImageDigest !== undefined &&
    expectedImageDigest !== "" &&
    !/^sha256:[a-f0-9]{64}$/i.test(expectedImageDigest)
  ) {
    throw new Error(
      "Expected image digest must be sha256: followed by 64 hexadecimal characters.",
    );
  }
  const report = await runVerification({
    config,
    token,
    expectedSha,
    ...(startedAfter ? { startedAfter } : {}),
    ...(expectedImageDigest ? { expectedImageDigest } : {}),
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
