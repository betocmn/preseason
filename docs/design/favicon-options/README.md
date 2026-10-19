# Preseason favicon concepts

Three proposed treatments of the existing Preseason script logo. Open `index.html`
in a browser to compare them beside the existing wordmark, in brand color and white,
and at an actual 16 px tab size. The buttons change this preview page's favicon.
To view over HTTP, serve a directory containing both this folder and the referenced
`public/preseason-brand/preseason-logo-cropped.png`, preserving their relative paths.

1. **Signature** (`01-signature.svg`): a vector interpretation of the existing
   wordmark's open P loop and curved brush stem. Recommended for continuity with
   the current logo.
2. **Ribbon** (`02-ribbon.svg`): a heavier, simplified P retaining the forward slant
   and sweeping bowl. It gives up some of the original handwriting for a stronger
   silhouette at small sizes.
3. **Swoosh** (`03-swoosh.svg`): the script initial with a tapered underline drawn
   from the existing wordmark. More expressive; the extra detail makes the P
   slightly smaller at favicon size.

All three use a cyan-to-blue gradient inspired by the existing logo. Their
silhouettes also work in one color, as shown in the preview. SVGs have transparent
backgrounds and no font or external image dependencies. The logo in the preview
is the actual existing asset, not a replacement wordmark.

These are design options awaiting a choice. The application's active favicon,
manifest, metadata, wordmark, and social images are untouched. Once a direction
is chosen, adapt it to the SVG, ICO, PNG, Apple touch icon, and manifest icon sizes,
with a final optical adjustment at 16 px. Review social artwork with the same mark
as part of the asset rollout.
