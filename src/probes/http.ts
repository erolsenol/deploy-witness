import type { LookupAddress } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import type { CheckResult, HttpProbeConfig } from "../contracts/index.js";
import {
  type ProbeLookup,
  ProbeTargetError,
  resolveProbeTarget,
} from "./target.js";

export interface HttpProbeOptions {
  readonly fetchImpl?: typeof fetch;
  readonly lookupImpl?: ProbeLookup;
  readonly maxBodyBytes?: number;
}

function safeUrl(raw: string, allowLocalHttp: boolean): URL | undefined {
  try {
    const url = new URL(raw);
    const safeProtocol =
      url.protocol === "https:" || (url.protocol === "http:" && allowLocalHttp);
    if (!safeProtocol || url.username || url.password || url.hash)
      return undefined;
    return url;
  } catch {
    return undefined;
  }
}

async function pinnedHttpRequest(
  url: URL,
  address: LookupAddress,
  timeoutMs: number,
): Promise<Response> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const pinnedLookup: LookupFunction = (
    _requestedHostname,
    lookupOptions,
    callback,
  ) => {
    if (lookupOptions.all) callback(null, [address]);
    else callback(null, address.address, address.family);
  };
  const requestOptions = {
    method: "GET",
    headers: {
      accept: "application/json, text/plain;q=0.9, */*;q=0.1",
      "accept-encoding": "identity",
    },
    lookup: pinnedLookup,
    agent: false,
    signal: AbortSignal.timeout(timeoutMs),
    ...(isIP(hostname) === 0 ? { servername: hostname } : {}),
  };
  const response = await new Promise<import("node:http").IncomingMessage>(
    (resolve, reject) => {
      const request = url.protocol === "https:" ? httpsRequest : httpRequest;
      const outgoing = request(url, requestOptions, resolve);
      outgoing.once("error", reject);
      outgoing.end();
    },
  );

  const headers = new Headers();
  for (let index = 0; index < response.rawHeaders.length; index += 2) {
    const name = response.rawHeaders[index];
    const value = response.rawHeaders[index + 1];
    if (name !== undefined && value !== undefined) headers.append(name, value);
  }
  const status = response.statusCode ?? 502;
  const body =
    status === 204 || status === 205 || status === 304
      ? null
      : (Readable.toWeb(response) as ReadableStream<Uint8Array>);
  if (!body) response.destroy();
  return new Response(body, { status, headers });
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The result body is intentionally discarded after status-only checks.
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

async function verifySingleHttpProbe(
  probe: HttpProbeConfig,
  options: HttpProbeOptions = {},
): Promise<CheckResult> {
  const started = Date.now();
  const observedAt = new Date(started).toISOString();
  const url = safeUrl(probe.url, probe.allowLocalHttp);
  if (!url) {
    return checkResult(
      probe,
      "FAIL",
      "Probe URL must use HTTPS; localhost HTTP requires allowLocalHttp: true.",
      observedAt,
      0,
      [],
      "HTTP_URL_UNSAFE",
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBodyBytes = options.maxBodyBytes ?? 256 * 1024;
  let addresses: readonly LookupAddress[];
  try {
    addresses = await resolveProbeTarget(
      url,
      probe.allowLocalHttp,
      options.lookupImpl,
      probe.timeoutMs - (Date.now() - started),
    );
  } catch (error) {
    const failureCode =
      error instanceof ProbeTargetError ? error.code : "HTTP_DNS_LOOKUP_FAILED";
    return checkResult(
      probe,
      "FAIL",
      failureCode === "HTTP_DNS_LOOKUP_FAILED"
        ? "The endpoint hostname could not be resolved safely."
        : "The endpoint must resolve only to public addresses; local HTTP requires explicit opt-in.",
      observedAt,
      Date.now() - started,
      [],
      failureCode,
    );
  }

  const remainingTimeoutMs = probe.timeoutMs - (Date.now() - started);
  if (remainingTimeoutMs <= 0) {
    return checkResult(
      probe,
      "FAIL",
      "The endpoint hostname lookup exceeded the probe deadline.",
      observedAt,
      Date.now() - started,
      [],
      "HTTP_DNS_LOOKUP_FAILED",
    );
  }

  let response: Response;
  try {
    response = options.fetchImpl
      ? await fetchImpl(url, {
          method: "GET",
          headers: { accept: "application/json, text/plain;q=0.9, */*;q=0.1" },
          signal: AbortSignal.timeout(remainingTimeoutMs),
          redirect: "manual",
        })
      : await pinnedHttpRequest(
          url,
          addresses[0] as LookupAddress,
          remainingTimeoutMs,
        );
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
    await discardBody(response);
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
      await discardBody(response);
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
      } else {
        evidence.push({
          source: "http",
          observedAt,
          field: `json:${probe.expectedJson.path}:matches`,
          expected: true,
          observed: false,
        });
        problems.push("Response body was empty");
      }
    }
  }

  if (!probe.expectedJson) await discardBody(response);

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

export async function verifyHttpProbe(
  probe: HttpProbeConfig,
  options: HttpProbeOptions = {},
): Promise<CheckResult> {
  if (!probe.stability || probe.stability.consecutiveSuccesses === 1) {
    return verifySingleHttpProbe(probe, options);
  }

  const consecutiveRequired = probe.stability?.consecutiveSuccesses ?? 1;
  const intervalMs = probe.stability?.intervalMs ?? 1_000;
  const started = Date.now();
  const maxAttempts = Math.min(
    20,
    Math.max(1, Math.floor(probe.timeoutMs / intervalMs) + 1),
  );
  const attempts: CheckResult[] = [];
  let consecutiveSuccesses = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const remainingMs = probe.timeoutMs - (Date.now() - started);
    if (remainingMs <= 0) break;

    const result = await verifySingleHttpProbe(
      { ...probe, timeoutMs: Math.min(probe.timeoutMs, remainingMs) },
      options,
    );
    attempts.push(result);
    consecutiveSuccesses =
      result.status === "PASS" ? consecutiveSuccesses + 1 : 0;
    if (consecutiveSuccesses >= consecutiveRequired) break;

    const waitMs = Math.min(
      intervalMs,
      probe.timeoutMs - (Date.now() - started),
    );
    if (waitMs <= 0 || attempt === maxAttempts - 1) break;
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  }

  const lastAttempt = attempts.at(-1);
  const passed = consecutiveSuccesses >= consecutiveRequired;
  const observedAt = new Date().toISOString();
  const evidence: CheckResult["evidence"] = attempts.flatMap(
    (result, index) => [
      {
        source: "http",
        observedAt: result.evidence[0]?.observedAt ?? observedAt,
        field: `attempt:${index + 1}:status`,
        expected: "PASS",
        observed: result.status,
      },
      ...result.evidence,
    ],
  );

  if (!lastAttempt) {
    return checkResult(
      probe,
      "FAIL",
      "The endpoint probe deadline expired before a request could complete.",
      observedAt,
      Date.now() - started,
      [],
      "HTTP_PROBE_TIMEOUT",
    );
  }

  return checkResult(
    probe,
    passed ? "PASS" : "FAIL",
    passed
      ? `HTTP endpoint passed ${consecutiveRequired} consecutive checks.`
      : `HTTP endpoint did not pass ${consecutiveRequired} consecutive checks within ${attempts.length} attempts.`,
    observedAt,
    Date.now() - started,
    evidence,
    passed ? undefined : (lastAttempt.failureCode ?? "HTTP_STABILITY_FAILED"),
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
