import type { CheckResult } from "../../contracts/index.js";
import { CoolifyApiError, CoolifyClient } from "./client.js";
import type { CoolifyDeployment } from "./types.js";
import { deploymentSha, newestDeployment } from "./types.js";

export interface VerifyCoolifyOptions {
  readonly baseUrl: string;
  readonly resourceUuid: string;
  readonly token: string;
  readonly expectedSha: string;
  readonly timeoutSeconds: number;
  readonly pollIntervalSeconds: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

type NormalizedStatus = "pending" | "success" | "failure" | "unknown";

function normalizeStatus(raw: string | undefined): NormalizedStatus {
  switch (raw?.trim().toLowerCase()) {
    case "queued":
    case "in_progress":
    case "building":
    case "processing":
      return "pending";
    case "finished":
    case "successful":
    case "succeeded":
      return "success";
    case "failed":
    case "cancelled":
    case "canceled":
      return "failure";
    default:
      return "unknown";
  }
}

function check(
  id: string,
  status: CheckResult["status"],
  summary: string,
  evidence: CheckResult["evidence"],
  failureCode?: string,
): CheckResult {
  return {
    id,
    category: id.startsWith("provider.") ? "provider" : "deployment",
    required: true,
    status,
    summary,
    durationMs: 0,
    evidence,
    ...(failureCode ? { failureCode } : {}),
  };
}

function deploymentChecks(
  deployment: CoolifyDeployment | undefined,
  expectedSha: string,
  observedAt: string,
  noDeploymentExpired: boolean,
): readonly CheckResult[] {
  if (!deployment) {
    const summary = noDeploymentExpired
      ? "No Coolify deployment was found before the verification deadline."
      : "Waiting for a Coolify deployment record.";
    return [
      check(
        "deployment.status",
        "UNKNOWN",
        summary,
        [],
        "DEPLOYMENT_NOT_FOUND",
      ),
      check(
        "deployment.commit",
        "UNKNOWN",
        "No deployment commit is available to compare.",
        [],
        "DEPLOYMENT_COMMIT_MISSING",
      ),
    ];
  }

  const rawStatus = deployment.status;
  const sha = deploymentSha(deployment);
  const providerStatus = normalizeStatus(rawStatus);
  const statusEvidence = rawStatus
    ? [{ source: "coolify", observedAt, field: "status", observed: rawStatus }]
    : [];
  const commitEvidence = sha
    ? [
        {
          source: "coolify",
          observedAt,
          field: "commit",
          expected: expectedSha,
          observed: sha,
        },
      ]
    : [];

  const statusCheck =
    providerStatus === "success"
      ? check(
          "deployment.status",
          "PASS",
          "Coolify reports a successful terminal deployment.",
          statusEvidence,
        )
      : providerStatus === "failure"
        ? check(
            "deployment.status",
            "FAIL",
            "Coolify reports a failed or cancelled deployment.",
            statusEvidence,
            "DEPLOYMENT_FAILED",
          )
        : providerStatus === "pending"
          ? check(
              "deployment.status",
              "UNKNOWN",
              "The latest Coolify deployment is still in progress.",
              statusEvidence,
              "DEPLOYMENT_PENDING",
            )
          : check(
              "deployment.status",
              "UNKNOWN",
              "Coolify returned a deployment status DeployWitness does not recognize.",
              statusEvidence,
              "DEPLOYMENT_STATUS_UNKNOWN",
            );

  const commitCheck = !sha
    ? check(
        "deployment.commit",
        "UNKNOWN",
        "Coolify did not provide a deployment commit SHA.",
        [],
        "DEPLOYMENT_COMMIT_MISSING",
      )
    : sha.toLowerCase() === expectedSha.toLowerCase()
      ? check(
          "deployment.commit",
          "PASS",
          "The latest deployment commit exactly matches the expected SHA.",
          commitEvidence,
        )
      : check(
          "deployment.commit",
          "FAIL",
          "The latest deployment commit does not match the expected SHA.",
          commitEvidence,
          "DEPLOYMENT_SHA_MISMATCH",
        );

  return [statusCheck, commitCheck];
}

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function isTransient(error: unknown): boolean {
  return (
    error instanceof CoolifyApiError &&
    (error.code === "COOLIFY_NETWORK_ERROR" ||
      error.code === "COOLIFY_RATE_LIMITED" ||
      error.code === "COOLIFY_HTTP_ERROR")
  );
}

function providerFailure(
  error: unknown,
  observedAt: string,
): readonly CheckResult[] {
  const code =
    error instanceof CoolifyApiError ? error.code : "COOLIFY_REQUEST_FAILED";
  const status =
    code === "COOLIFY_UNAUTHORIZED" || code === "COOLIFY_FORBIDDEN"
      ? "FAIL"
      : code === "COOLIFY_TOKEN_MISSING" ||
          code === "COOLIFY_URL_INVALID" ||
          code === "COOLIFY_HTTPS_REQUIRED"
        ? "FAIL"
        : "UNKNOWN";
  const summary =
    status === "FAIL"
      ? "Coolify configuration or read-only authentication was rejected. Check the URL, resource UUID, and token permissions."
      : "Coolify could not provide a reliable deployment response before the deadline.";

  return [
    check(
      "provider.coolify-api",
      status,
      summary,
      [{ source: "coolify", observedAt, field: "errorCode", observed: code }],
      code,
    ),
    check(
      "deployment.status",
      "UNKNOWN",
      "Deployment state could not be verified.",
      [],
      "DEPLOYMENT_UNVERIFIED",
    ),
    check(
      "deployment.commit",
      "UNKNOWN",
      "Deployment commit could not be verified.",
      [],
      "DEPLOYMENT_UNVERIFIED",
    ),
  ];
}

export async function verifyCoolifyDeployment(
  options: VerifyCoolifyOptions,
): Promise<readonly CheckResult[]> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const deadline = now() + options.timeoutSeconds * 1000;
  let client: CoolifyClient;

  try {
    client = new CoolifyClient({
      baseUrl: options.baseUrl,
      resourceUuid: options.resourceUuid,
      token: options.token,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
  } catch (error) {
    return providerFailure(error, new Date(now()).toISOString());
  }

  let lastDeployment: CoolifyDeployment | undefined;
  let apiObservedAt: string | undefined;
  let lastError: unknown;

  while (now() < deadline) {
    try {
      const deployments = await client.listApplicationDeployments();
      apiObservedAt = new Date(now()).toISOString();
      lastDeployment = newestDeployment(deployments);
      lastError = undefined;

      if (lastDeployment) {
        const status = normalizeStatus(lastDeployment.status);
        if (
          status === "success" ||
          status === "failure" ||
          status === "unknown"
        )
          break;
      }
    } catch (error) {
      lastError = error;
      if (!isTransient(error))
        return providerFailure(error, new Date(now()).toISOString());
    }

    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(options.pollIntervalSeconds * 1000, remaining));
  }

  if (lastError && !apiObservedAt)
    return providerFailure(lastError, new Date(now()).toISOString());

  const observedAt = apiObservedAt ?? new Date(now()).toISOString();
  const providerCheck = check(
    "provider.coolify-api",
    apiObservedAt ? "PASS" : "UNKNOWN",
    apiObservedAt
      ? "Coolify deployment API responded successfully."
      : "No reliable response was received from Coolify.",
    apiObservedAt
      ? [
          {
            source: "coolify",
            observedAt,
            field: "resourceUuid",
            observed: options.resourceUuid,
          },
        ]
      : [],
    apiObservedAt ? undefined : "COOLIFY_NO_RESPONSE",
  );
  return [
    providerCheck,
    ...deploymentChecks(
      lastDeployment,
      options.expectedSha,
      observedAt,
      now() >= deadline,
    ),
  ];
}

export { normalizeStatus as normalizeCoolifyStatus };
