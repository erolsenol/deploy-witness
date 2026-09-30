import { z } from "zod";

export const CheckStatusSchema = z.enum([
  "PASS",
  "FAIL",
  "WARN",
  "SKIP",
  "UNKNOWN",
  "UNSUPPORTED",
]);

export const EvidenceValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const EvidenceSchema = z.object({
  source: z.string().min(1),
  observedAt: z.string().datetime({ offset: true }),
  field: z.string().min(1),
  expected: EvidenceValueSchema.optional(),
  observed: EvidenceValueSchema.optional(),
});

export const CheckResultSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
  category: z.enum(["provider", "deployment", "runtime", "config"]),
  required: z.boolean(),
  status: CheckStatusSchema,
  summary: z.string().min(1),
  durationMs: z.number().nonnegative(),
  evidence: z.array(EvidenceSchema).default([]),
  failureCode: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*$/)
    .optional(),
});

export const VerificationReportSchema = z.object({
  schemaVersion: z.literal(1),
  toolVersion: z.string().min(1),
  runId: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  expectedSha: z.string().regex(/^[a-f0-9]{40,64}$/i),
  provider: z.literal("coolify"),
  resourceUuid: z.string().min(1),
  decision: z.enum(["PASS", "FAIL", "INCOMPLETE"]),
  checks: z.array(CheckResultSchema),
});

const HttpProbeSchema = z
  .object({
    name: z.string().min(1).max(64),
    url: z.string().url(),
    required: z.boolean().default(true),
    allowLocalHttp: z.boolean().default(false),
    expectedStatus: z.number().int().min(100).max(599).default(200),
    timeoutMs: z.number().int().min(250).max(30_000).default(5_000),
    stability: z
      .object({
        consecutiveSuccesses: z.number().int().min(1).max(10).default(1),
        intervalMs: z.number().int().min(100).max(10_000).default(1_000),
      })
      .strict()
      .optional(),
    expectedHeader: z
      .object({ name: z.string().min(1), value: z.string() })
      .strict()
      .optional()
      .refine(
        (header) =>
          !header ||
          ![
            "authorization",
            "proxy-authorization",
            "www-authenticate",
            "proxy-authenticate",
            "set-cookie",
            "cookie",
          ].includes(header.name.toLowerCase()),
        "Sensitive response headers cannot be used as runtime markers.",
      ),
    expectedJson: z
      .object({ path: z.string().min(1), value: EvidenceValueSchema })
      .strict()
      .optional(),
  })
  .strict();

export const VerificationConfigSchema = z
  .object({
    version: z.literal(1),
    provider: z.literal("coolify"),
    coolify: z
      .object({
        baseUrl: z.string().url(),
        resourceUuid: z.string().min(1).max(128),
      })
      .strict(),
    deployment: z
      .object({
        expectedSha: z
          .string()
          .regex(/^[a-f0-9]{40,64}$/i)
          .optional(),
        startedAfter: z.string().datetime({ offset: true }).optional(),
        timeoutSeconds: z.number().int().min(10).max(1800).default(600),
        pollIntervalSeconds: z.number().int().min(1).max(60).default(5),
      })
      .strict(),
    probes: z.array(HttpProbeSchema).max(20).default([]),
  })
  .strict();

export type CheckStatus = z.infer<typeof CheckStatusSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type CheckResult = z.infer<typeof CheckResultSchema>;
export type VerificationReport = z.infer<typeof VerificationReportSchema>;
export type HttpProbeConfig = z.infer<typeof HttpProbeSchema>;
export type VerificationConfig = z.infer<typeof VerificationConfigSchema>;

export function decide(
  checks: readonly CheckResult[],
): VerificationReport["decision"] {
  const required = checks.filter((check) => check.required);

  if (required.some((check) => check.status === "FAIL")) return "FAIL";
  if (
    required.some(
      (check) =>
        check.status === "UNKNOWN" ||
        check.status === "UNSUPPORTED" ||
        check.status === "SKIP",
    )
  ) {
    return "INCOMPLETE";
  }
  if (required.some((check) => check.status !== "PASS")) return "FAIL";
  return "PASS";
}
