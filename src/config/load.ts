import { readFile } from "node:fs/promises";
import { parseDocument } from "yaml";
import {
  type VerificationConfig,
  VerificationConfigSchema,
} from "../contracts/index.js";

const MAX_CONFIG_BYTES = 256 * 1024;

export const CONFIG_ENV_OVERRIDES = {
  coolifyBaseUrl: "DEPLOY_WITNESS_COOLIFY_BASE_URL",
  coolifyResourceUuid: "DEPLOY_WITNESS_COOLIFY_RESOURCE_UUID",
  expectedSha: "DEPLOY_WITNESS_EXPECTED_SHA",
  startedAfter: "DEPLOY_WITNESS_STARTED_AFTER",
} as const;

export interface LoadedConfig {
  readonly config: VerificationConfig;
  readonly path: string;
  readonly appliedOverrides: readonly string[];
}

export interface LoadConfigOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export class ConfigLoadError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ConfigLoadError";
  }
}

export async function loadConfigDetails(
  path: string,
  options: LoadConfigOptions = {},
): Promise<LoadedConfig> {
  let source: string;
  try {
    const file = await readFile(path);
    if (file.byteLength > MAX_CONFIG_BYTES) {
      throw new ConfigLoadError(
        "CONFIG_TOO_LARGE",
        "Configuration exceeds the 256 KiB limit.",
      );
    }
    source = file.toString("utf8");
  } catch (error) {
    if (error instanceof ConfigLoadError) throw error;
    throw new ConfigLoadError(
      "CONFIG_READ_FAILED",
      "Configuration file could not be read.",
    );
  }

  const document = parseDocument(source, { uniqueKeys: true, schema: "core" });
  if (document.errors.length > 0) {
    throw new ConfigLoadError(
      "CONFIG_YAML_INVALID",
      "Configuration is not valid YAML.",
    );
  }

  const rawConfig = document.toJS({ maxAliasCount: 0 }) as unknown;
  const env = options.env ?? process.env;
  const overrides = Object.entries(CONFIG_ENV_OVERRIDES).flatMap(
    ([field, name]) => (env[name]?.length ? [[field, name] as const] : []),
  );
  let configWithOverrides = rawConfig;
  if (
    overrides.length > 0 &&
    typeof rawConfig === "object" &&
    rawConfig !== null
  ) {
    const root = rawConfig as Record<string, unknown>;
    const coolify =
      typeof root.coolify === "object" && root.coolify !== null
        ? (root.coolify as Record<string, unknown>)
        : {};
    const deployment =
      typeof root.deployment === "object" && root.deployment !== null
        ? (root.deployment as Record<string, unknown>)
        : {};
    configWithOverrides = {
      ...root,
      coolify: {
        ...coolify,
        ...(env[CONFIG_ENV_OVERRIDES.coolifyBaseUrl]
          ? { baseUrl: env[CONFIG_ENV_OVERRIDES.coolifyBaseUrl] }
          : {}),
        ...(env[CONFIG_ENV_OVERRIDES.coolifyResourceUuid]
          ? { resourceUuid: env[CONFIG_ENV_OVERRIDES.coolifyResourceUuid] }
          : {}),
      },
      deployment: {
        ...deployment,
        ...(env[CONFIG_ENV_OVERRIDES.expectedSha]
          ? { expectedSha: env[CONFIG_ENV_OVERRIDES.expectedSha] }
          : {}),
        ...(env[CONFIG_ENV_OVERRIDES.startedAfter]
          ? { startedAfter: env[CONFIG_ENV_OVERRIDES.startedAfter] }
          : {}),
      },
    };
  }
  const validation = VerificationConfigSchema.safeParse(configWithOverrides);
  if (!validation.success) {
    const paths = [
      ...new Set(
        validation.error.issues.map(
          (issue) => issue.path.join(".") || "<root>",
        ),
      ),
    ];
    throw new ConfigLoadError(
      "CONFIG_INVALID",
      `Configuration is invalid at: ${paths.join(", ")}.`,
    );
  }
  return {
    config: validation.data,
    path,
    appliedOverrides: overrides.map(([, name]) => name),
  };
}

export async function loadConfig(
  path: string,
  options: LoadConfigOptions = {},
): Promise<VerificationConfig> {
  return (await loadConfigDetails(path, options)).config;
}
