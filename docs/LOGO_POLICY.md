# Logo Policy

Preseason includes third-party product/service logos under `public/logos/` for
identification in benchmark results and category listings.

## Purpose

These logos are used only to identify the corresponding tools referenced in
benchmark outputs. Their presence does not imply sponsorship, endorsement, or
partnership.

## Usage Rules in This Repository

- Logos remain the property of their respective trademark owners.
- We use logos under nominative fair use for factual identification.
- We avoid modifying marks beyond size/format adjustments needed for UI display.
- We do not claim exclusive rights over any third-party marks.

## Removal or Correction Requests

If you represent a trademark owner and want a logo updated, credited
differently, or removed, open an issue:

<https://github.com/betocmn/preseason/issues/new>

Include the logo/tool name and requested change.

## Dependency License Audit Notes

Audit command run on **May 26, 2026**:

```bash
pnpm licenses list
```

### Summary

- The dependency graph is primarily permissive (MIT, Apache-2.0, BSD, ISC).
- Mixed/other permissive licenses present:
  - `MPL-2.0` (for `lightningcss` packages)
  - `CC-BY-4.0` (for `caniuse-lite` browser data)
  - `Unlicense` (e.g., `postgres`, `tweetnacl`)
  - `MIT OR Apache-2.0` (Biome packages)
- No GPL/AGPL dependencies were reported by this command output.

These notes are for project hygiene and are not legal advice.
