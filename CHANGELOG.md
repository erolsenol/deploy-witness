# Changelog

## 0.2.5 — 2026-10-01

- Define the security and compatibility boundary for a future opt-in GitHub artifact attestation verifier.

## 0.2.4 — 2026-10-01

- Document supported runtimes, current provider validation, 0.x compatibility, schema migration, and reporting policies.

## 0.2.3 — 2026-10-01

- Smoke-test the packed npm consumer install, CLI, config v2 schema, public API, and Action manifest in CI and release workflows.

## 0.2.2 — 2026-10-01

- Include valid observed runtime image digests in report evidence and distinguish missing, malformed, and mismatched markers.

## 0.2.1 — 2026-10-01

- Report the package version consistently from the CLI and JSON evidence reports.

## 0.2.0 — 2026-10-01

- Add config v2 with strict `deployment.expectedImageDigest` validation while preserving config v1.
- Add CLI, environment, and GitHub Action expected image digest overrides.
- Add runtime image digest marker verification through `imageDigestJsonPath`.
- Report provider image digest capability as unsupported when no observed immutable digest is available; never infer a digest from a mutable image tag.
- Publish config v1, config v2, and report v1 JSON Schemas and add digest evidence decision documentation.
- Compare SHA-256 hex markers case-insensitively while leaving other JSON marker comparisons unchanged.
- Add Node 22/24 CI, tag-verified GitHub releases, and a manual npm OIDC publishing workflow.
