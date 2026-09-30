import {
  type VercelDeploymentDetail,
  VercelDeploymentDetailSchema,
  VercelDeploymentListSchema,
  type VercelDeploymentSummary,
} from "./types.js";

const API_BASE_URL = "https://api.vercel.com";

export class VercelApiError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
  ) {
    super(code);
    this.name = "VercelApiError";
  }
}

export interface VercelClientOptions {
  readonly projectId: string;
  readonly teamId?: string;
  readonly token: string;
  readonly fetchImpl?: typeof fetch;
}

export class VercelClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: VercelClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async getJson(url: URL, timeoutMs: number): Promise<unknown> {
    if (!this.options.token) throw new VercelApiError("VERCEL_TOKEN_MISSING");
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${this.options.token}`,
          accept: "application/json",
        },
        signal: AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, 15_000))),
        redirect: "error",
      });
    } catch {
      throw new VercelApiError("VERCEL_NETWORK_ERROR");
    }
    if (response.status === 401)
      throw new VercelApiError("VERCEL_UNAUTHORIZED", 401);
    if (response.status === 403)
      throw new VercelApiError("VERCEL_FORBIDDEN", 403);
    if (response.status === 429)
      throw new VercelApiError("VERCEL_RATE_LIMITED", 429);
    if (response.status >= 500)
      throw new VercelApiError("VERCEL_SERVER_ERROR", response.status);
    if (!response.ok)
      throw new VercelApiError("VERCEL_HTTP_ERROR", response.status);

    let payload: unknown;
    try {
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > 2 * 1024 * 1024)
        throw new VercelApiError("VERCEL_RESPONSE_TOO_LARGE");
      payload = JSON.parse(text) as unknown;
    } catch (error) {
      if (error instanceof VercelApiError) throw error;
      throw new VercelApiError("VERCEL_INVALID_JSON");
    }
    return payload;
  }

  async listDeployments(
    target: "production" | "preview",
    timeoutMs: number,
  ): Promise<readonly VercelDeploymentSummary[]> {
    const url = new URL("/v7/deployments", API_BASE_URL);
    url.searchParams.set("projectId", this.options.projectId);
    url.searchParams.set("target", target);
    url.searchParams.set("limit", "20");
    if (this.options.teamId)
      url.searchParams.set("teamId", this.options.teamId);
    const payload = VercelDeploymentListSchema.safeParse(
      await this.getJson(url, timeoutMs),
    );
    if (!payload.success) throw new VercelApiError("VERCEL_RESPONSE_INVALID");
    return payload.data.deployments;
  }

  async getDeployment(
    id: string,
    timeoutMs: number,
  ): Promise<VercelDeploymentDetail> {
    const url = new URL(
      `/v13/deployments/${encodeURIComponent(id)}`,
      API_BASE_URL,
    );
    url.searchParams.set("withGitRepoInfo", "true");
    if (this.options.teamId)
      url.searchParams.set("teamId", this.options.teamId);
    const payload = VercelDeploymentDetailSchema.safeParse(
      await this.getJson(url, timeoutMs),
    );
    if (!payload.success) throw new VercelApiError("VERCEL_RESPONSE_INVALID");
    return payload.data;
  }
}
