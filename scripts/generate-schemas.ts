import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPublicJsonSchema } from "../src/contracts/json-schema.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const checkOnly = process.argv.includes("--check");
if (!checkOnly) await mkdir(`${root}schemas/`, { recursive: true });

for (const name of ["config", "report"] as const) {
  const path = `${root}schemas/${name}-v1.schema.json`;
  const content = `${JSON.stringify(createPublicJsonSchema(name), null, 2)}\n`;
  if (checkOnly) {
    const current = await readFile(path, "utf8").catch(() => "");
    if (current !== content) {
      console.error(`Stale public JSON Schema: ${path}`);
      process.exitCode = 1;
    }
  } else {
    await writeFile(path, content, { encoding: "utf8", mode: 0o644 });
    console.log(`Generated ${path}`);
  }
}
