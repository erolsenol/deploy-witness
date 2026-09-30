# DeployWitness

> Prove that the commit you expected is the commit your users can reach.

DeployWitness is an open-source CLI and GitHub Action for checking deployments after your CI/CD system has run. Coolify and Vercel adapters read deployment records, while public HTTP endpoints are probed separately. It produces a machine-readable report and a clear pass/fail result.

DeployWitness verifies; it does not deploy, roll back, run migrations, or change provider state.

## What it checks

- The latest deployment belongs to the configured Coolify application or Vercel project and target.
- The provider reports a successful terminal state.
- The deployment commit exactly matches the expected full Git SHA.
- If `started-after` is provided, the provider deployment must have been created after that CI run boundary; without it, the report warns that it cannot correlate the deployment to the current run.
- Configured health endpoints and optional version markers respond as expected.
- Optional stability checks can require several consecutive successful responses after the deployment.
- Every check is reported separately, with missing or unknown evidence kept visible.
- Provider capabilities are reported as `SUPPORTED`, `UNSUPPORTED`, or `UNAVAILABLE` for this run, so consumers can distinguish missing support from an inaccessible provider API.
- Coolify and Vercel status, commit, target, and freshness evidence is evaluated by one shared decision module after each adapter normalizes provider data.

An HTTP 200 alone does not prove that the requested commit is live. Add a version endpoint or response header if you need an independent runtime commit check.

For an endpoint that briefly flaps during startup, add bounded stability to that probe. The per-probe `timeoutMs` remains the total deadline; attempts are capped at 20 and failed attempts reset the consecutive-success count:

```yaml
probes:
  - name: public-health
    url: https://app.example.com/health
    stability:
      consecutiveSuccesses: 3
      intervalMs: 1000
```

## Quick start

Requirements: Node.js 22 or newer.

    git clone https://github.com/erolsenol/deploy-witness.git
    cd deploy-witness
    npm ci
    npm run build
    node dist/cli.js init
    node dist/cli.js config validate
    node dist/cli.js verify --expected-sha "$GITHUB_SHA" --report deploy-witness-report.json --junit deploy-witness.xml

Set `COOLIFY_API_TOKEN` or `VERCEL_TOKEN` in the environment from your secret manager according to the selected provider before running `verify`. The GitHub Action and source repository are public. npm registry publication is not available yet; use the source checkout for the CLI or pin the Action to a reviewed commit SHA.

`config validate` checks the effective configuration. `config explain` shows the file path, applied override names, and planned check IDs without printing configuration values. Explicit CLI flags take precedence over these environment variables, which take precedence over YAML/JSON:

| Environment variable | Overrides |
| --- | --- |
| `DEPLOY_WITNESS_COOLIFY_BASE_URL` | `coolify.baseUrl` |
| `DEPLOY_WITNESS_COOLIFY_RESOURCE_UUID` | `coolify.resourceUuid` |
| `DEPLOY_WITNESS_EXPECTED_SHA` | `deployment.expectedSha` |
| `DEPLOY_WITNESS_STARTED_AFTER` | `deployment.startedAfter` |
| `DEPLOY_WITNESS_VERCEL_PROJECT_ID` | `vercel.projectId` |
| `DEPLOY_WITNESS_VERCEL_TEAM_ID` | `vercel.teamId` |
| `DEPLOY_WITNESS_VERCEL_TARGET` | `vercel.target` (`production` or `preview`) |

Provider tokens are secret inputs and are not part of config inspection or reports.

For Vercel, use `node dist/cli.js init --provider vercel`, provide the project ID and target, and set `VERCEL_TOKEN`. Team projects may also set a team ID. DeployWitness lists only that project and target, then requests the deployment detail with Git repository information to compare its full commit SHA. The Vercel token is used only for read-only GET requests.

The Vercel adapter uses the official [deployment list endpoint](https://vercel.com/docs/rest-api/deployments/list-deployments) scoped by project and target, then the [deployment detail endpoint](https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url) with `withGitRepoInfo=true`. Vercel represents preview deployment `target` as `null`; DeployWitness normalizes that documented value to `preview`.

Deployment history is read in bounded pages: Coolify uses its documented [`skip`/`take` pagination](https://coolify.io/docs/api/endpoints/deployments/list-deployments-by-app-uuid), and Vercel follows the documented [`pagination.next` cursor](https://vercel.com/docs/rest-api/deployments/list-deployments) with `until`. The scan stops after five pages or the verification deadline. If that bound is reached before history is complete, deployment ordering is reported as unknown and verification cannot pass on incomplete history.

## JSON Schema contracts

The versioned config and report schemas live in [`schemas/`](schemas/). Regenerate them after changing the Zod contracts with `npm run schema:generate`; CI checks that the committed schemas stay synchronized. You can also print a schema for tooling with `node dist/cli.js schema config` or `node dist/cli.js schema report`. JSON Schema documents structural constraints; run `config validate` for DeployWitness-specific semantic and security validation before using a configuration.

Reports include a `capabilities` inventory. `SUPPORTED` means the adapter can verify that behavior, `UNSUPPORTED` means the adapter does not implement it, and `UNAVAILABLE` means a supported feature could not be confirmed because the provider API was inaccessible during that run. Capability information is informational and does not replace required deployment checks.

See the [report v1 evidence and freshness decision record](docs/adr/0001-evidence-and-freshness-v1.md) for the required/optional decision matrix and evidence limits. Schema-validated [correlated PASS](examples/report-pass-v1.json), [uncorrelated PASS with warning](examples/report-pass-uncorrelated-v1.json), and [stale deployment FAIL](examples/report-stale-v1.json) reports are available as consumer examples.

JUnit output preserves the verification decision: required warnings and failures become failures, required unknown/unsupported/skipped checks become errors, and optional non-pass checks remain skipped so they do not turn an overall PASS into a failing CI result.

## GitHub Actions

The Action runs after your deploy step. Store the read-only provider token as a GitHub Actions secret and provide it through the matching Action input; never put the token in the config file.

    # Capture the boundary immediately before your deployment step, then run
    # the deployment step, and place DeployWitness after it.
    - name: Mark deployment start
      id: deploy-witness-boundary
      shell: bash
      run: echo "timestamp=$(node -p 'new Date().toISOString()')" >> "$GITHUB_OUTPUT"

    - name: Verify deployment
      uses: erolsenol/deploy-witness@d9422aad71bf17e90fb8a38ae8d73c63945bbd35
      with:
        config: deploy-witness.yml
        coolify-token: ${{ secrets.COOLIFY_READ_ONLY_TOKEN }}
        expected-sha: ${{ github.sha }}
        started-after: ${{ steps.deploy-witness-boundary.outputs.timestamp }}

For Vercel, select a `provider: vercel` config and pass `vercel-token: ${{ secrets.VERCEL_READ_ONLY_TOKEN }}` instead. The Action masks either provider token before verification.

Create a Coolify configuration with `node dist/cli.js init` or a Vercel configuration with `node dist/cli.js init --provider vercel`. Set the relevant project/resource identifier, target, timeout and probes in `deploy-witness.yml`. Run this step only in a trusted workflow that is allowed to access the provider token. Do not pass deployment secrets to untrusted fork pull requests.

## Security and evidence boundaries

- Provider access is read-only.
- Coolify and Vercel tokens are masked in GitHub Actions and are never written into the JSON report.
- HTTP probe redirects are not followed; the Coolify token is never sent to probe URLs.
- Probe DNS answers are checked and connections are pinned to a validated address; private and special-use ranges are rejected.
- Localhost HTTP is disabled unless a probe explicitly sets `allowLocalHttp: true`.
- CLI can emit JUnit XML with `--junit <path>` for CI test-report ingestion.
- A provider status or response field DeployWitness does not recognize is reported as unknown, not success.
- Reports are diagnostic evidence, not a cryptographic attestation or proof that the provider itself is trustworthy.

See [SECURITY.md](SECURITY.md), [the architecture and roadmap](docs/plan.md), and [the task list](tasks/todo.md).

## Development

    npm ci

Husky installs the local Git hooks during `npm ci`. Before each commit, the
`pre-commit` hook runs lint and checks that the committed JSON schemas match the
source contracts. Before each push, the `pre-push` hook runs the complete
quality gate: lint, schema check, typecheck, tests, build, and package dry run.
If a check fails, Git stops the commit or push. Run these commands manually with
`npm run lint`, `npm run schema:check`, `npm run typecheck`, `npm test`,
`npm run build`, and `npm pack --dry-run` when needed.

## License

MIT. See [LICENSE](LICENSE).
