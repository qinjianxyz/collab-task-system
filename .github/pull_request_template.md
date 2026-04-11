## Summary

- what changed
- why it changed

## Verification

- [ ] `bun run typecheck`
- [ ] `bun run test`
- [ ] `bun run test:e2e` or justified why not

## Contract Review

- [ ] shared schemas updated if API or event payloads changed
- [ ] docs updated if runtime, protocol, or operational behavior changed
- [ ] no direct CRUD writes bypass the event log
