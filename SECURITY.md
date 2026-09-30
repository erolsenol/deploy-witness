# Security Policy

## Reporting a vulnerability

Please do not file public issues for suspected security vulnerabilities. Use GitHub's private vulnerability reporting for this repository. Include a minimal reproduction and the affected version; do not include live provider tokens or customer data.

## Security boundaries

DeployWitness is designed to observe deployments using read-only provider credentials. It does not deploy or mutate provider resources. Treat provider tokens as secrets and scope them to the smallest read-only permissions available. Do not run workflows that expose deployment secrets on untrusted pull requests.

The project does not claim that a successful check is a signed attestation or a guarantee of application correctness.
