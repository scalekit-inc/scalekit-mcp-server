# Feature Requests & Notes

Scratch pad for ideas, improvements, and things to revisit. Not tracked in git.

---

## README / Docs

- [ ] Update README tool inventory — 12 tools missing, 2 ghost tools listed
- [ ] Fix `create_organization_user` param docs (code takes `email` + `role`, not `externalId`/`firstName`/etc.)
- [ ] Fix stale URLs: `/guides/mcp/overview` badge, `/fsa/quickstart/` link
- [ ] Document the 9 `docs://` resources in the README

## Code Fixes

- [ ] Version mismatch: `package.json` says `1.0.0`, `config.ts` says `0.0.0`
- [ ] Dockerfile EXPOSE 3001 but default port is 3000
- [ ] `var` → `const` in `workspace.ts:79`
- [ ] Remove unused `id` params from `createRoleById`, `createScopeById`, `listScopesById` in `endpoints.ts`
- [ ] Fix indentation in `connections.ts` `enableConnectionTool`

## Open PRs / Branches

- [ ] Open PR for `feat/search-connectors-and-tools` (21 commits ahead of main)
- [ ] Merge PR #34 (`fix/mcp-error-responses` — isError flag on errors)
- [ ] Coordinate: land search-connectors first, rebase isError PR on top

## Feature Ideas

- [ ] 
- [ ] 
- [ ] 

## Notes

- 
