# bun-router TODO

## Package Publishing

### Publish to Registries
**Status:** In Progress
**Description:** First package to publish via pantry.

**Registry Names:**
- Our registry: `bun-router`
- npm: `@stacksjs/bun-router` (plain name taken)

**Tasks:**
- [ ] Prepare package for publish
- [ ] Test publish workflow via pantry
- [ ] Configure trusted publisher on npm (after first publish)
- [ ] Verify OIDC workflow for subsequent releases

---

## Notes

- Current npm tokens are bad/expired (phased out by npm)
- First publish requires tokens, subsequent uses OIDC
- On our registry, can use plain `bun-router` name
