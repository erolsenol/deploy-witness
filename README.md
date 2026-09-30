# DeployWitness

> Prove that the commit you expected is the commit your users can reach.

DeployWitness is an open-source CLI and GitHub Action for checking deployments after your CI/CD system has run. Its first adapter reads deployment records from Coolify and separately probes public HTTP endpoints. It produces a machine-readable report and a clear pass/fail result.

DeployWitness verifies; it does not deploy, roll back, run migrations, or change provider state.

## What it checks

- The latest Coolify deployment belongs to the configured application.
- The provider reports a successful terminal state.
- The deployment commit exactly matches the expected full Git SHA.
- If `started-after` is provided, the Coolify deployment must have been created after that CI run boundary; without it, the report warns that it cannot correlate the deployment to the current run.
- Configured health endpoints and optional version markers respond as expected.
- Optional stability checks can require several consecutive successful responses after the deployment.
- Every check is reported separately, with missing or unknown evidence kept visible.

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

Set `COOLIFY_API_TOKEN` in the environment from your secret manager before running `verify`. The GitHub Action and source repository are public. npm registry publication is not available yet; use the source checkout for the CLI or pin the Action to a reviewed commit SHA.

## GitHub Actions

The Action runs after your deploy step. Store the read-only Coolify API token as a GitHub Actions secret and provide it through the Action input; never put the token in the config file.

    # Capture the boundary immediately before your deployment step, then run
    # the deployment step, and place DeployWitness after it.
    - name: Mark deployment start
      id: deploy-witness-boundary
      shell: bash
      run: echo "timestamp=$(node -p 'new Date().toISOString()')" >> "$GITHUB_OUTPUT"

    - name: Verify deployment
      uses: erolsenol/deploy-witness@655b438f8bf85576fce3fa88780778290dfc66d9
      with:
        config: deploy-witness.yml
        coolify-token: ${{ secrets.COOLIFY_READ_ONLY_TOKEN }}
        expected-sha: ${{ github.sha }}
        started-after: ${{ steps.deploy-witness-boundary.outputs.timestamp }}

Create the configuration with `node dist/cli.js init`, then set the Coolify URL, application UUID, timeout and probes in `deploy-witness.yml`. Run this step only in a trusted workflow that is allowed to access the Coolify token. Do not pass deployment secrets to untrusted fork pull requests.

## Security and evidence boundaries

- Provider access is read-only.
- Coolify tokens are masked in GitHub Actions and are never written into the JSON report.
- HTTP probe redirects are not followed; the Coolify token is never sent to probe URLs.
- Probe DNS answers are checked and connections are pinned to a validated address; private and special-use ranges are rejected.
- Localhost HTTP is disabled unless a probe explicitly sets `allowLocalHttp: true`.
- CLI can emit JUnit XML with `--junit <path>` for CI test-report ingestion.
- A provider status or response field DeployWitness does not recognize is reported as unknown, not success.
- Reports are diagnostic evidence, not a cryptographic attestation or proof that the provider itself is trustworthy.

See [SECURITY.md](SECURITY.md), [the architecture and roadmap](docs/plan.md), and [the task list](tasks/todo.md).

## Development

    npm ci
    npm run typecheck
    npm test
    npm run lint
    npm run build

## License

MIT. See [LICENSE](LICENSE).
