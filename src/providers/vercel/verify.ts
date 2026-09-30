import type { CheckResult, VerificationConfig } from "../../contracts/index.js";
import { VercelApiError, VercelClient } from "./client.js";
import {
  type VercelDeploymentDetail,
  type VercelDeploymentSummary,
  vercelTimestamp,
} from "./types.js";

type VercelConfig = Extract<VerificationConfig, { provider: "vercel" }>;

export interface VerifyVercelOptions {
  readonly config: VercelConfig;
  readonly token: string;
  readonly expectedSha: string;
  readonly startedAfter?: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function result(
  id: string,
  status: CheckResult["status"],
  summary: string,
  _observedAt: string,
  startedAt: number,
  evidence: CheckResult["evidence"] = [],
  failureCode?: string,
  required = true,
): CheckResult {
  return {
    id,
    category: id.startsWith("provider.") ? "provider" : "deployment",
    required,
    status,
    summary,
    durationMs: Math.max(0, Date.now() - startedAt),
    evidence,
    ...(failureCode ? { failureCode } : {}),
  };
}

function evidence(
  observedAt: string,
  field: string,
  expected?: string | number | null,
  observed?: string | number | null,
): CheckResult["evidence"] {
  return [
    {
      source: "vercel",
      observedAt,
      field,
      ...(expected !== undefined ? { expected } : {}),
      ...(observed !== undefined ? { observed } : {}),
    },
  ];
}

function apiFailure(error: unknown): {
  readonly code: string;
  readonly summary: string;
} {
  if (!(error instanceof VercelApiError))
    return {
      code: "VERCEL_REQUEST_FAILED",
      summary: "The Vercel API request failed safely.",
    };
  const descriptions: Record<string, string> = {
    VERCEL_TOKEN_MISSING: "Set VERCEL_TOKEN to read deployment information.",
    VERCEL_UNAUTHORIZED: "Vercel rejected the access token.",
    VERCEL_FORBIDDEN: "The Vercel token cannot access this project.",
    VERCEL_RATE_LIMITED: "Vercel rate limited the deployment request.",
    VERCEL_NETWORK_ERROR: "Vercel could not be reached.",
    VERCEL_RESPONSE_INVALID: "Vercel returned an unexpected response shape.",
    VERCEL_INVALID_JSON: "Vercel returned invalid JSON.",
    VERCEL_RESPONSE_TOO_LARGE: "Vercel response exceeded the safety limit.",
  };
  return {
    code: error.code,
    summary:
      descriptions[error.code] ?? "The Vercel API request did not succeed.",
  };
}

function incompleteDeployment(
  observedAt: string,
  startedAt: number,
  code: string,
  summary: string,
): readonly CheckResult[] {
  return [
    result(
      "provider.vercel-api",
      "PASS",
      "Vercel API responded successfully.",
      observedAt,
      startedAt,
    ),
    result(
      "deployment.status",
      "UNKNOWN",
      summary,
      observedAt,
      startedAt,
      [],
      code,
    ),
    result(
      "deployment.commit",
      "UNKNOWN",
      "No deployment commit is available to compare.",
      observedAt,
      startedAt,
      [],
      code,
    ),
  ];
}

function newestDeployment(deployments: readonly VercelDeploymentSummary[]): {
  deployment?: VercelDeploymentSummary;
  error?: string;
} {
  if (
    deployments.some((deployment) => vercelTimestamp(deployment) === undefined)
  )
    return { error: "DEPLOYMENT_ORDER_UNCERTAIN" };
  const sorted = [...deployments].sort(
    (left, right) =>
      (vercelTimestamp(right) ?? 0) - (vercelTimestamp(left) ?? 0),
  );
  const newest = sorted[0];
  if (!newest) return {};
  if (sorted[1] && vercelTimestamp(sorted[1]) === vercelTimestamp(newest)) {
    return { error: "DEPLOYMENT_ORDER_UNCERTAIN" };
  }
  if (!(newest.uid ?? newest.id)) return { error: "DEPLOYMENT_ID_MISSING" };
  return { deployment: newest };
}

function evaluateDeployment(
  config: VercelConfig,
  deployment: VercelDeploymentDetail,
  expectedSha: string,
  startedAfter: string | undefined,
  observedAt: string,
  startedAt: number,
): readonly CheckResult[] {
  const checks: CheckResult[] = [];
  const timestamp = vercelTimestamp(deployment);
  const normalizedTarget = deployment.target ?? "preview";
  const wantedTarget = config.vercel.target;
  const targetMatches = normalizedTarget === wantedTarget;
  const readyState = deployment.readyState;
  const pending = ["BUILDING", "INITIALIZING", "QUEUED"].includes(readyState);
  const status: CheckResult["status"] =
    readyState === "READY"
      ? "PASS"
      : readyState === "ERROR" || readyState === "CANCELED"
        ? "FAIL"
        : "UNKNOWN";
  checks.push(
    result(
      "provider.vercel-api",
      "PASS",
      "Vercel deployment details were retrieved.",
      observedAt,
      startedAt,
    ),
    result(
      "deployment.status",
      targetMatches ? status : "FAIL",
      targetMatches
        ? `Vercel deployment state is ${readyState}.`
        : `Vercel deployment target ${normalizedTarget} does not match configured target ${wantedTarget}.`,
      observedAt,
      startedAt,
      evidence(
        observedAt,
        targetMatches ? "readyState" : "target",
        targetMatches ? "READY" : wantedTarget,
        targetMatches ? readyState : normalizedTarget,
      ),
      !targetMatches
        ? "VERCEL_TARGET_MISMATCH"
        : pending
          ? "VERCEL_DEPLOYMENT_PENDING"
          : status === "UNKNOWN"
            ? "VERCEL_STATE_UNKNOWN"
            : status === "FAIL"
              ? `VERCEL_${readyState}`
              : undefined,
    ),
  );

  const sha = deployment.gitSource?.sha;
  const shaMatches =
    sha !== undefined && sha.toLowerCase() === expectedSha.toLowerCase();
  checks.push(
    result(
      "deployment.commit",
      sha === undefined ? "UNKNOWN" : shaMatches ? "PASS" : "FAIL",
      sha === undefined
        ? "Vercel did not provide a Git source commit for this deployment."
        : shaMatches
          ? "Vercel Git source commit matches the expected full SHA."
          : "Vercel Git source commit does not match the expected SHA.",
      observedAt,
      startedAt,
      evidence(observedAt, "gitSource.sha", expectedSha, sha ?? null),
      sha === undefined
        ? "DEPLOYMENT_COMMIT_MISSING"
        : shaMatches
          ? undefined
          : "DEPLOYMENT_SHA_MISMATCH",
    ),
  );

  if (startedAfter === undefined) {
    checks.push(
      result(
        "deployment.freshness",
        "WARN",
        "No run-start boundary was supplied; this deployment cannot be correlated to the current CI run.",
        observedAt,
        startedAt,
        evidence(observedAt, "createdAt", undefined, timestamp ?? null),
        "DEPLOYMENT_RUN_CORRELATION_UNAVAILABLE",
        false,
      ),
    );
  } else if (timestamp === undefined) {
    checks.push(
      result(
        "deployment.freshness",
        "UNKNOWN",
        "Vercel did not provide a usable deployment creation timestamp.",
        observedAt,
        startedAt,
        [],
        "DEPLOYMENT_ORDER_UNCERTAIN",
      ),
    );
  } else {
    const boundary = Date.parse(startedAfter);
    const fresh = timestamp > boundary;
    checks.push(
      result(
        "deployment.freshness",
        fresh ? "PASS" : "FAIL",
        fresh
          ? "Vercel deployment was created after the supplied run-start boundary."
          : "Vercel deployment was not created strictly after the supplied run-start boundary.",
        observedAt,
        startedAt,
        evidence(observedAt, "createdAt", boundary, timestamp),
        fresh ? undefined : "DEPLOYMENT_STALE",
      ),
    );
  }
  return checks;
}

export async function verifyVercelDeployment(
  options: VerifyVercelOptions,
): Promise<readonly CheckResult[]> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const startedAt = now();
  const deadline = startedAt + options.config.deployment.timeoutSeconds * 1000;
  const client = new VercelClient({
    projectId: options.config.vercel.projectId,
    ...(options.config.vercel.teamId
      ? { teamId: options.config.vercel.teamId }
      : {}),
    token: options.token,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
  let lastObservedAt = new Date(startedAt).toISOString();

  while (now() < deadline) {
    const remainingMs = deadline - now();
    try {
      const deployments = await client.listDeployments(
        options.config.vercel.target,
        remainingMs,
      );
      lastObservedAt = new Date(now()).toISOString();
      if (deployments.length === 0) {
        await sleep(
          Math.min(
            options.config.deployment.pollIntervalSeconds * 1000,
            Math.max(1, deadline - now()),
          ),
        );
        continue;
      }
      const newest = newestDeployment(deployments);
      if (newest.error) {
        return incompleteDeployment(
          lastObservedAt,
          startedAt,
          newest.error,
          "Vercel deployments could not be ordered confidently.",
        );
      }
      const id = newest.deployment?.uid ?? newest.deployment?.id;
      if (!id) {
        return incompleteDeployment(
          lastObservedAt,
          startedAt,
          "DEPLOYMENT_ID_MISSING",
          "Vercel did not return a deployment identifier.",
        );
      }
      const detail = await client.getDeployment(
        id,
        Math.max(1, deadline - now()),
      );
      lastObservedAt = new Date(now()).toISOString();
      if (
        detail.projectId &&
        detail.projectId !== options.config.vercel.projectId
      ) {
        return [
          result(
            "provider.vercel-api",
            "PASS",
            "Vercel API responded successfully.",
            lastObservedAt,
            startedAt,
          ),
          result(
            "deployment.status",
            "FAIL",
            "Vercel returned a deployment from a different project.",
            lastObservedAt,
            startedAt,
            evidence(
              lastObservedAt,
              "projectId",
              options.config.vercel.projectId,
              detail.projectId,
            ),
            "VERCEL_PROJECT_MISMATCH",
          ),
          result(
            "deployment.commit",
            "UNKNOWN",
            "A matching project deployment is unavailable.",
            lastObservedAt,
            startedAt,
            [],
            "VERCEL_PROJECT_MISMATCH",
          ),
        ];
      }
      const checks = evaluateDeployment(
        options.config,
        detail,
        options.expectedSha,
        options.startedAfter,
        lastObservedAt,
        startedAt,
      );
      const statusCheck = checks.find(
        (check) => check.id === "deployment.status",
      );
      if (
        statusCheck?.status === "UNKNOWN" &&
        statusCheck.failureCode === "VERCEL_STATE_UNKNOWN"
      ) {
        return checks;
      }
      if (statusCheck?.status === "UNKNOWN") {
        await sleep(
          Math.min(
            options.config.deployment.pollIntervalSeconds * 1000,
            Math.max(1, deadline - now()),
          ),
        );
        continue;
      }
      return checks;
    } catch (error) {
      const failure = apiFailure(error);
      return [
        result(
          "provider.vercel-api",
          "FAIL",
          failure.summary,
          lastObservedAt,
          startedAt,
          [],
          failure.code,
        ),
        result(
          "deployment.status",
          "UNKNOWN",
          "Vercel deployment state is unavailable.",
          lastObservedAt,
          startedAt,
          [],
          failure.code,
        ),
        result(
          "deployment.commit",
          "UNKNOWN",
          "Vercel deployment commit is unavailable.",
          lastObservedAt,
          startedAt,
          [],
          failure.code,
        ),
      ];
    }
  }

  return incompleteDeployment(
    lastObservedAt,
    startedAt,
    "VERCEL_DEPLOYMENT_TIMEOUT",
    "No matching Vercel deployment became ready before the verification deadline.",
  );
}
