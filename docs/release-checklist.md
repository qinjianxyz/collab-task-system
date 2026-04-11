# Release Checklist

Use this before cutting a public release or recording the evaluator demo.

## Versioning

- update `CHANGELOG.md`
- confirm the release version/tag
- confirm README and docs reflect shipped behavior, not planned work

## Verification

- `bun run typecheck`
- `bun run test`
- `bun run test:e2e`
- `docker compose up --build`
- verify `GET /api/health`
- run the two-tab demo manually

The test commands are expected to be self-bootstrapping from a clean clone after `bun install`.

## Scale Proof

- run `bun run load:seed`
- rerun the relevant load probes if the sync, projection, or buffering path changed
- refresh `docs/scaling.md` if numbers changed materially

## Launch Assets

- refresh screenshots or demo recording if UI behavior changed
- verify links in README, API docs, SECURITY, and CONTRIBUTING
- verify issue templates and PR template still match maintainer expectations

## Publish

- commit the final docs and release notes
- create the git tag
- publish the GitHub release notes
