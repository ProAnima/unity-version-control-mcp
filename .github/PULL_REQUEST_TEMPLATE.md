## Summary

Describe the change and the source-control workflow it affects.

## Safety

- [ ] No arbitrary shell execution was added.
- [ ] No arbitrary `cm` execution was added.
- [ ] Mutating behavior is guarded by mode checks and prepare/confirm when appropriate.
- [ ] Workspace file paths remain constrained to `UVCS_WORKSPACE`.

## Tests

- [ ] `npm test`
- [ ] `npm run check`
- [ ] `npm pack --dry-run`
- [ ] Live Plastic SCM / Unity Version Control smoke test, if applicable.

