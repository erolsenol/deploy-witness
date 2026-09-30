import type { CoolifyDeployment } from "./types.js";
import { CoolifyDeploymentListSchema } from "./types.js";

export class CoolifyApiError extends Error {
  readonly code: string;
  readonly status: number | undefined;

  constructor(code: string, status?: number) {
    super(code);
    this.name = "CoolifyApiError";
    this.code = code;
    this.status = status;
  }
}

export interface CoolifyClientOptions {
  readonly baseUrl: string;
  readonly resourceUuid: string;
  readonly token: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

function parseBaseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CoolifyApiError("COOLIFY_URL_INVALID");
  }

  const local =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new CoolifyApiError("COOLIFY_HTTPS_REQUIRED");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new CoolifyApiError("COOLIFY_URL_INVALID");
  }
  return url;
}

export class CoolifyClient {
  readonly #baseUrl: URL;
  readonly #resourceUuid: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(options: CoolifyClientOptions) {
    if (!options.token.trim())
      throw new CoolifyApiError("COOLIFY_TOKEN_MISSING");
    this.#baseUrl = parseBaseUrl(options.baseUrl);
    this.#resourceUuid = options.resourceUuid;
    this.#token = options.token;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
  }

  async listApplicationDeployments(
    skip = 0,
    take = 20,
  ): Promise<readonly CoolifyDeployment[]> {
    const url = new URL(this.#baseUrl);
    const prefix = url.pathname.replace(/\/$/, "");
    url.pathname = `${prefix}/api/v1/deployments/applications/${encodeURIComponent(this.#resourceUuid)}`;
    url.searchParams.set("skip", String(skip));
    url.searchParams.set("take", String(take));

    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.#token}`,
        },
        signal: AbortSignal.timeout(this.#timeoutMs),
        redirect: "error",
      });
    } catch {
      throw new CoolifyApiError("COOLIFY_NETWORK_ERROR");
    }

    if (response.status === 401)
      throw new CoolifyApiError("COOLIFY_UNAUTHORIZED", 401);
    if (response.status === 403)
      throw new CoolifyApiError("COOLIFY_FORBIDDEN", 403);
    if (response.status === 429)
      throw new CoolifyApiError("COOLIFY_RATE_LIMITED", 429);
    if (!response.ok)
      throw new CoolifyApiError("COOLIFY_HTTP_ERROR", response.status);

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new CoolifyApiError("COOLIFY_INVALID_JSON");
    }

    const parsed = CoolifyDeploymentListSchema.safeParse(body);
    if (!parsed.success) throw new CoolifyApiError("COOLIFY_RESPONSE_INVALID");
    return parsed.data;
  }
}
