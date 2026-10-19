# Preseason favicon concepts

**Selected: 01 / Signature.** The approved mark is now in `public/favicon/favicon.svg`.

Three treatments of the existing Preseason script logo. Open `index.html`
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

The approved mark is used in the SVG favicon, the transparent 96 px PNG, and the
16, 32, 48, and 64 px ICO frames. The 180 px Apple touch icon has an opaque charcoal
background with a centered mark at 74% of the canvas width. The 192 and 512 px
maskable manifest icons use the same background with the mark at 64%, keeping the
silhouette inside the central safe circle. Raster assets are rendered from the
production SVG. The shared social image renderer reads that SVG directly, so the
homepage, Twitter, and page-specific social previews use the same approved mark.
