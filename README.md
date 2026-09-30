# DeployWitness

> Prove that the commit you expected is the commit your users can reach.

DeployWitness is an open-source CLI and GitHub Action for checking deployments after your CI/CD system has run. Its first adapter reads deployment records from Coolify and separately probes public HTTP endpoints. It produces a machine-readable report and a clear pass/fail result.

DeployWitness verifies; it does not deploy, roll back, run migrations, or change provider state.

## What it checks

- The latest Coolify deployment belongs to the configured application.
- The provider reports a successful terminal state.
- The deployment commit exactly matches the expected full Git SHA.
- Configured health endpoints and optional version markers respond as expected.
- Every check is reported separately, with missing or unknown evidence kept visible.

An HTTP 200 alone does not prove that the requested commit is live. Add a version endpoint or response header if you need an independent runtime commit check.

## Quick start

Requirements: Node.js 22 or newer.

    git clone https://github.com/erolsenol/deploy-witness.git
    cd deploy-witness
    npm ci
    npm run build
    node dist/cli.js init
    node dist/cli.js config validate
    node dist/cli.js verify --expected-sha "$GITHUB_SHA"

Set `COOLIFY_API_TOKEN` in the environment from your secret manager before running `verify`. The GitHub Action and source repository are public. npm registry publication is not available yet; use the source checkout for the CLI or pin the Action to a reviewed commit SHA.

## GitHub Actions

The Action runs after your deploy step. Store the read-only Coolify API token as a GitHub Actions secret and provide it through the Action input; never put the token in the config file.

    - name: Verify deployment
      uses: erolsenol/deploy-witness@37467fa35ab12547c4037710fd566066a70cd2a8
      with:
        config: deploy-witness.yml
        coolify-token: ${{ secrets.COOLIFY_READ_ONLY_TOKEN }}
        expected-sha: ${{ github.sha }}

Create the configuration with `npx deploy-witness init`, then set the Coolify URL, application UUID, timeout and probes in `deploy-witness.yml`. Run this step only in a trusted workflow that is allowed to access the Coolify token. Do not pass deployment secrets to untrusted fork pull requests.

## Security and evidence boundaries

- Provider access is read-only.
- Coolify tokens are masked in GitHub Actions and are never written into the JSON report.
- HTTP probe redirects are not followed; credentials are never sent to probe URLs.
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
