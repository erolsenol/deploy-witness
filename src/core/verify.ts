import { randomUUID } from "node:crypto";
import type {
  CheckResult,
  VerificationConfig,
  VerificationReport,
} from "../contracts/index.js";
import { decide, VerificationReportSchema } from "../contracts/index.js";
import { verifyHttpProbe } from "../probes/http.js";
import { providerCapabilities } from "../providers/capabilities.js";
import { verifyCoolifyDeployment } from "../providers/coolify/verify.js";
import { verifyVercelDeployment } from "../providers/vercel/verify.js";

export interface RunVerificationOptions {
  readonly config: VerificationConfig;
  readonly token: string;
  readonly expectedSha: string;
  readonly startedAfter?: string;
  readonly fetchImpl?: typeof fetch;
}

function skippedRuntimeChecks(
  config: VerificationConfig,
  summary: string,
): readonly CheckResult[] {
  return config.probes.map((probe) => ({
    id: `http.${
      probe.name
        .toLowerCase()
        .replace(/[^a-z0-9.-]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48) || "probe"
    }`,
    category: "runtime",
    required: probe.required,
    status: "SKIP",
    summary,
    durationMs: 0,
    evidence: [],
    failureCode: "RUNTIME_CHECK_NOT_RUN",
  }));
}

export async function runVerification(
  options: RunVerificationOptions,
): Promise<VerificationReport> {
  const { config } = options;
  const startedAfter = options.startedAfter ?? config.deployment.startedAfter;
  if (
    startedAfter !== undefined &&
    !Number.isFinite(Date.parse(startedAfter))
  ) {
    throw new Error("STARTED_AFTER_INVALID");
  }
  const providerChecks =
    config.provider === "coolify"
      ? await verifyCoolifyDeployment({
          baseUrl: config.coolify.baseUrl,
          resourceUuid: config.coolify.resourceUuid,
          token: options.token,
          expectedSha: options.expectedSha,
          ...(startedAfter ? { startedAfter } : {}),
          timeoutSeconds: config.deployment.timeoutSeconds,
          pollIntervalSeconds: config.deployment.pollIntervalSeconds,
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        })
      : await verifyVercelDeployment({
          config,
          token: options.token,
          expectedSha: options.expectedSha,
          ...(startedAfter ? { startedAfter } : {}),
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        });

  const deploymentVerified = providerChecks
    .filter(
      (result) =>
        result.id.startsWith("provider.") ||
        result.id.startsWith("deployment."),
    )
    .every((result) => !result.required || result.status === "PASS");
  const providerApiAvailable = providerChecks.some(
    (result) =>
      result.id.endsWith("-api") &&
      result.category === "provider" &&
      result.status === "PASS",
  );

  const runtimeChecks = deploymentVerified
    ? await Promise.all(
        config.probes.map((probe) =>
          verifyHttpProbe(
            probe,
            options.fetchImpl ? { fetchImpl: options.fetchImpl } : {},
          ),
        ),
      )
    : skippedRuntimeChecks(
        config,
        "Runtime probes were not run because provider deployment evidence did not pass.",
      );

  return VerificationReportSchema.parse({
    schemaVersion: 1,
    toolVersion: "0.1.0",
    runId: randomUUID(),
    createdAt: new Date().toISOString(),
    expectedSha: options.expectedSha,
    provider: config.provider,
    resourceUuid:
      config.provider === "coolify"
        ? config.coolify.resourceUuid
        : config.vercel.projectId,
    decision: decide([...providerChecks, ...runtimeChecks]),
    capabilities: providerCapabilities(config.provider, providerApiAvailable),
    checks: [...providerChecks, ...runtimeChecks],
  });
}
