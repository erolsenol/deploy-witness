# Changelog

## 0.2.0 — 2026-10-01

- Add config v2 with strict `deployment.expectedImageDigest` validation while preserving config v1.
- Add CLI, environment, and GitHub Action expected image digest overrides.
- Add runtime image digest marker verification through `imageDigestJsonPath`.
- Report provider image digest capability as unsupported when no observed immutable digest is available; never infer a digest from a mutable image tag.
- Publish config v1, config v2, and report v1 JSON Schemas and add digest evidence decision documentation.
- Compare SHA-256 hex markers case-insensitively while leaving other JSON marker comparisons unchanged.
- Add Node 22/24 CI, tag-verified GitHub releases, and a manual npm OIDC publishing workflow.
