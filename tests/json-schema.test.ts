import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPublicJsonSchema } from "../src/contracts/json-schema.js";

describe("public JSON Schemas", () => {
  it.each(["config", "report"] as const)(
    "keeps the checked-in %s schema synchronized with the runtime contract",
    async (name) => {
      const path = join(process.cwd(), "schemas", `${name}-v1.schema.json`);
      const checkedIn = await readFile(path, "utf8");
      const generated = `${JSON.stringify(createPublicJsonSchema(name), null, 2)}\n`;
      expect(checkedIn).toBe(generated);
      expect(JSON.parse(checkedIn)).toMatchObject({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        title:
          name === "config"
            ? "DeployWitness Configuration v1"
            : "DeployWitness Verification Report v1",
      });
    },
  );
});
