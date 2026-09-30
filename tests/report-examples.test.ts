import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VerificationReportSchema } from "../src/contracts/index.js";

const exampleDirectory = new URL("../examples/", import.meta.url);

async function loadExample(name: string) {
  const contents = await readFile(
    fileURLToPath(new URL(name, exampleDirectory)),
    "utf8",
  );
  return VerificationReportSchema.parse(JSON.parse(contents));
}

describe("published report v1 examples", () => {
  it("keeps correlated successful evidence as PASS", async () => {
    const report = await loadExample("report-pass-v1.json");
    expect(report.decision).toBe("PASS");
    expect(report.checks.every((check) => check.status === "PASS")).toBe(true);
  });

  it("makes missing run correlation visible as an optional warning", async () => {
    const report = await loadExample("report-pass-uncorrelated-v1.json");
    expect(report.decision).toBe("PASS");
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "deployment.freshness",
        required: false,
        status: "WARN",
        failureCode: "DEPLOYMENT_RUN_CORRELATION_UNAVAILABLE",
      }),
    );
  });

  it("keeps a stale deployment as a required failure", async () => {
    const report = await loadExample("report-stale-v1.json");
    expect(report.decision).toBe("FAIL");
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "deployment.freshness",
        required: true,
        status: "FAIL",
        failureCode: "DEPLOYMENT_STALE",
      }),
    );
  });
});
