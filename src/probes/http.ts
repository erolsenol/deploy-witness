import type { CheckResult, HttpProbeConfig } from "../contracts/index.js";

export interface HttpProbeOptions {
  readonly fetchImpl?: typeof fetch;
  readonly maxBodyBytes?: number;
}

function localHttpAllowed(url: URL): boolean {
  return (
    url.protocol === "https:" ||
    (url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname))
  );
}

function safeUrl(raw: string): URL | undefined {
  try {
    const url = new URL(raw);
    if (!localHttpAllowed(url) || url.username || url.password || url.hash)
      return undefined;
    return url;
  } catch {
    return undefined;
  }
}

function pathValue(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (["__proto__", "prototype", "constructor"].includes(key))
      return undefined;
    if (typeof current !== "object" || current === null) return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function sameScalar(left: unknown, right: unknown): boolean {
  return (
    (typeof left === "string" ||
      typeof left === "number" ||
      typeof left === "boolean" ||
      left === null) &&
    left === right
  );
}

function checkResult(
  probe: HttpProbeConfig,
  status: CheckResult["status"],
  summary: string,
  _observedAt: string,
  durationMs: number,
  evidence: CheckResult["evidence"],
  failureCode?: string,
): CheckResult {
  const idPart = probe.name
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return {
    id: `http.${idPart || "probe"}`,
    category: "runtime",
    required: probe.required,
    status,
    summary,
    durationMs,
    evidence,
    ...(failureCode ? { failureCode } : {}),
  };
}

export async function verifyHttpProbe(
  probe: HttpProbeConfig,
  options: HttpProbeOptions = {},
): Promise<CheckResult> {
  const started = Date.now();
  const observedAt = new Date(started).toISOString();
  const url = safeUrl(probe.url);
  if (!url) {
    return checkResult(
      probe,
      "FAIL",
      "Probe URL must use HTTPS; HTTP is allowed only for localhost.",
      observedAt,
      0,
      [],
      "HTTP_URL_UNSAFE",
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBodyBytes = options.maxBodyBytes ?? 256 * 1024;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json, text/plain;q=0.9, */*;q=0.1" },
      signal: AbortSignal.timeout(probe.timeoutMs),
      redirect: "manual",
    });
  } catch {
    return checkResult(
      probe,
      "FAIL",
      "The endpoint could not be reached before its timeout.",
      observedAt,
      Date.now() - started,
      [],
      "HTTP_REQUEST_FAILED",
    );
  }

  if (response.status >= 300 && response.status < 400) {
    return checkResult(
      probe,
      "FAIL",
      "The endpoint redirected; DeployWitness does not follow redirects.",
      observedAt,
      Date.now() - started,
      [
        {
          source: "http",
          observedAt,
          field: "status",
          expected: probe.expectedStatus,
          observed: response.status,
        },
      ],
      "HTTP_REDIRECT_BLOCKED",
    );
  }

  const evidence: CheckResult["evidence"][number][] = [
    {
      source: "http",
      observedAt,
      field: "status",
      expected: probe.expectedStatus,
      observed: response.status,
    },
  ];
  const problems: string[] = [];
  if (response.status !== probe.expectedStatus)
    problems.push("HTTP status did not match the expected value");

  if (probe.expectedHeader) {
    const observedHeader = response.headers.get(probe.expectedHeader.name);
    const matches = observedHeader === probe.expectedHeader.value;
    evidence.push({
      source: "http",
      observedAt,
      field: `header:${probe.expectedHeader.name.toLowerCase()}:matches`,
      expected: true,
      observed: matches,
    });
    if (!matches) problems.push("Expected response header did not match");
  }

  if (probe.expectedJson) {
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > maxBodyBytes) {
      problems.push("Response body exceeds the configured safety limit");
    } else {
      let bodyText: string;
      try {
        bodyText = await readLimitedBody(response, maxBodyBytes);
      } catch {
        problems.push("Response body could not be read safely");
        bodyText = "";
      }

      if (bodyText) {
        let body: unknown;
        try {
          body = JSON.parse(bodyText) as unknown;
        } catch {
          problems.push("Response body was not valid JSON");
          body = undefined;
        }
        const observed = pathValue(body, probe.expectedJson.path);
        const isScalar =
          typeof observed === "string" ||
          typeof observed === "number" ||
          typeof observed === "boolean" ||
          observed === null;
        const matches = sameScalar(observed, probe.expectedJson.value);
        evidence.push({
          source: "http",
          observedAt,
          field: `json:${probe.expectedJson.path}:matches`,
          expected: true,
          observed: isScalar && matches,
        });
        if (!matches) problems.push("Expected JSON marker did not match");
      }
    }
  }

  const status: CheckResult["status"] = problems.length === 0 ? "PASS" : "FAIL";
  return checkResult(
    probe,
    status,
    problems.length === 0
      ? "HTTP endpoint and configured runtime markers matched."
      : `${problems.join("; ")}.`,
    observedAt,
    Date.now() - started,
    evidence,
    problems.length === 0 ? undefined : "HTTP_PROBE_FAILED",
  );
}

async function readLimitedBody(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("HTTP_RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}
