import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface GitLabJob {
  readonly stage: string;
  readonly image?: string;
  readonly needs?: readonly {
    readonly job: string;
    readonly artifacts: boolean;
  }[];
  readonly script: readonly string[];
  readonly artifacts?: {
    readonly reports?: { readonly dotenv?: string };
  };
}

describe("published CI consumer examples", () => {
  it("keeps the GitLab deploy boundary connected to a secret-safe verify job", async () => {
    const example = parse(await readFile("examples/gitlab-ci.yml", "utf8")) as {
      readonly stages: readonly string[];
      readonly deploy_staging: GitLabJob;
      readonly verify_staging: GitLabJob & {
        readonly environment: { readonly name: string };
      };
    };

    expect(example.stages).toEqual(["deploy", "verify"]);
    expect(example.deploy_staging.artifacts?.reports?.dotenv).toBe(
      "deploy.env",
    );
    expect(example.deploy_staging.script[0]).toContain("DEPLOY_STARTED_AT=");
    expect(example.verify_staging.image).toBe("node:22");
    expect(example.verify_staging.environment.name).toBe("staging");
    expect(example.verify_staging.needs).toContainEqual({
      job: "deploy_staging",
      artifacts: true,
    });
    expect(example.verify_staging.script).toEqual(
      expect.arrayContaining([
        expect.stringContaining("deploy-witness@0.2.7"),
        expect.stringContaining(
          'export COOLIFY_API_TOKEN="$COOLIFY_READ_ONLY_TOKEN"',
        ),
        expect.stringContaining('--expected-sha "$CI_COMMIT_SHA"'),
        expect.stringContaining('--started-after "$DEPLOY_STARTED_AT"'),
      ]),
    );
  });

  it("pins the GitHub Action example to a full release commit SHA", async () => {
    const readme = await readFile("README.md", "utf8");
    expect(readme).toContain(
      "uses: erolsenol/deploy-witness@a4c6de5d9baebb7e568691f5b5af7c34b9c941dc",
    );
  });

  it("waits for npm publication and verifies the registry consumer", async () => {
    const workflow = parse(
      await readFile(".github/workflows/publish-npm.yml", "utf8"),
    ) as {
      readonly jobs: {
        readonly publish: {
          readonly steps: readonly {
            readonly name?: string;
            readonly run?: string;
          }[];
        };
      };
    };
    const steps = workflow.jobs.publish.steps;

    expect(steps.map((step) => step.name)).toContain(
      "Wait for registry visibility and verify provenance",
    );
    expect(steps.map((step) => step.name)).toContain(
      "Smoke-test the published registry package",
    );
    expect(
      steps.find(
        (step) =>
          step.name === "Wait for registry visibility and verify provenance",
      )?.run,
    ).toContain("for attempt in {1..48}");
    expect(
      steps.find(
        (step) =>
          step.name === "Wait for registry visibility and verify provenance",
      )?.run,
    ).toContain("slsa.dev/provenance/v1");
    expect(
      steps.find(
        (step) => step.name === "Smoke-test the published registry package",
      )?.run,
    ).toContain("schema config-v2");
  });
});
