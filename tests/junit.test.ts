import { describe, expect, it } from "vitest";
import { VerificationReportSchema } from "../src/contracts/index.js";
import { renderJUnit } from "../src/reporters/junit.js";

describe("JUnit reporter", () => {
  it("preserves check outcomes and escapes XML content", () => {
    const report = VerificationReportSchema.parse({
      schemaVersion: 1,
      toolVersion: "0.1.0",
      runId: "e59f3fb8-1727-4f77-bd59-e5c5f486e393",
      createdAt: "2026-09-30T12:00:00.000Z",
      expectedSha: "a".repeat(40),
      provider: "coolify",
      resourceUuid: "application-1",
      decision: "INCOMPLETE",
      checks: [
        {
          id: "provider.coolify-api",
          category: "provider",
          required: true,
          status: "PASS",
          summary: "Provider responded.",
          durationMs: 50,
        },
        {
          id: "deployment.commit",
          category: "deployment",
          required: true,
          status: "FAIL",
          summary: `Commit <expected> & "observed"`,
          failureCode: "DEPLOYMENT_SHA_MISMATCH",
          durationMs: 125,
        },
        {
          id: "deployment.status",
          category: "deployment",
          required: true,
          status: "UNKNOWN",
          summary: "Status is unknown.",
          durationMs: 10,
        },
        {
          id: "runtime.optional",
          category: "runtime",
          required: false,
          status: "WARN",
          summary: "Optional check failed.",
          durationMs: 0,
        },
        {
          id: "runtime.not-run",
          category: "runtime",
          required: true,
          status: "SKIP",
          summary: "Provider evidence did not pass.",
          durationMs: 0,
        },
      ],
    });

    const xml = renderJUnit(report);
    expect(xml).toContain('tests="5" failures="1" errors="1" skipped="2"');
    expect(xml).toContain("Commit &lt;expected&gt; &amp; &quot;observed&quot;");
    expect(xml).toContain('<failure type="DEPLOYMENT_SHA_MISMATCH"');
    expect(xml).toContain('<error type="UNKNOWN"');
    expect(xml).toContain('<skipped message="WARN: Optional check failed."');
  });
});
