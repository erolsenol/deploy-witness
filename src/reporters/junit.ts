import type { CheckResult, VerificationReport } from "../contracts/index.js";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function durationSeconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(3);
}

function renderCheck(check: CheckResult): string {
  const attributes = `classname="${escapeXml(check.category)}" name="${escapeXml(check.id)}" time="${durationSeconds(check.durationMs)}"`;
  if (check.status === "FAIL") {
    const code = check.failureCode ?? "VERIFICATION_FAILED";
    return `    <testcase ${attributes}><failure type="${escapeXml(code)}" message="${escapeXml(check.summary)}">${escapeXml(check.summary)}</failure></testcase>`;
  }
  if (check.status === "UNKNOWN" || check.status === "UNSUPPORTED") {
    const code = check.failureCode ?? check.status;
    return `    <testcase ${attributes}><error type="${escapeXml(code)}" message="${escapeXml(check.summary)}">${escapeXml(check.summary)}</error></testcase>`;
  }
  if (check.status === "SKIP" || check.status === "WARN") {
    return `    <testcase ${attributes}><skipped message="${escapeXml(`${check.status}: ${check.summary}`)}"/></testcase>`;
  }
  return `    <testcase ${attributes}/>`;
}

export function renderJUnit(report: VerificationReport): string {
  const failures = report.checks.filter(
    (check) => check.status === "FAIL",
  ).length;
  const errors = report.checks.filter(
    (check) => check.status === "UNKNOWN" || check.status === "UNSUPPORTED",
  ).length;
  const skipped = report.checks.filter(
    (check) => check.status === "SKIP" || check.status === "WARN",
  ).length;
  const duration = durationSeconds(
    report.checks.reduce((total, check) => total + check.durationMs, 0),
  );
  const testCases = report.checks.map(renderCheck).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="DeployWitness" tests="${report.checks.length}" failures="${failures}" errors="${errors}" skipped="${skipped}" time="${duration}" decision="${report.decision}">`,
    `  <testsuite name="deployment-verification" tests="${report.checks.length}" failures="${failures}" errors="${errors}" skipped="${skipped}" time="${duration}">`,
    testCases,
    "  </testsuite>",
    "</testsuites>",
    "",
  ].join("\n");
}
