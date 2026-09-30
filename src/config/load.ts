import { readFile } from "node:fs/promises";
import { parseDocument } from "yaml";
import {
  type VerificationConfig,
  VerificationConfigSchema,
} from "../contracts/index.js";

const MAX_CONFIG_BYTES = 256 * 1024;

export class ConfigLoadError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ConfigLoadError";
  }
}

export async function loadConfig(path: string): Promise<VerificationConfig> {
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

  const validation = VerificationConfigSchema.safeParse(
    document.toJS({ maxAliasCount: 0 }) as unknown,
  );
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
  return validation.data;
}
