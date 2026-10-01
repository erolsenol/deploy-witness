# CI integrations

DeployWitness runs as a CLI in any CI system that can install Node.js 22 or
newer. The [GitLab CI example](../examples/gitlab-ci.yml) shows a deploy job
passing its start time to a later verification job.

Before using the example:

1. Commit `deploy-witness.yml` with the Coolify URL, resource UUID and public
   health/version probes. Keep credentials out of the file.
2. Add `COOLIFY_READ_ONLY_TOKEN` as a masked and protected GitLab CI/CD variable.
   The example exports it as `COOLIFY_API_TOKEN` only for the verification job.
3. Replace `./ci/deploy-staging.sh` with the existing non-production deploy
   command.
4. Capture `DEPLOY_STARTED_AT` immediately before deployment. The dotenv report
   passes it to the verification job so an older deployment cannot satisfy the
   current pipeline.

The verification job installs the published CLI, checks the config, then runs
against `CI_COMMIT_SHA`. A failed required check exits non-zero and fails the
job. Do not expose the provider token to untrusted merge requests or forks.

The local CLI/Action integration tests exercise the same contracts against a
local fixture. They do not replace a successful authenticated run against a
non-production Coolify application.
