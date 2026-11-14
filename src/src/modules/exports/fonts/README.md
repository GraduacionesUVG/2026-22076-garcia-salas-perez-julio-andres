# PDF fallback fonts

GNU Unifont 15.0.06 TrueType fonts, pinned to the last pre-CFF2 format compatible
with `@pdf-lib/fontkit` 1.1.1. Helvetica remains the default for WinAnsi text.
These local fonts are only loaded for other characters, and glyph subsets are
embedded in each PDF. No runtime network request is needed.

Sources:

- https://ftp.gnu.org/gnu/unifont/unifont-15.0.06/unifont-15.0.06.ttf
- https://ftp.gnu.org/gnu/unifont/unifont-15.0.06/unifont_upper-15.0.06.ttf
- https://unifoundry.com/OFL-1.1.txt
- https://unifoundry.com/LICENSE.txt

SHA-256:

```text
9282b6eff54eeca2e7f58c9a40a91049bd219f3e6a45fbee8eba013379b9af3a  unifont-15.0.06.ttf
2c7035286fe16270c0c75b9de708c680fac3732dba5f85f9cce5c33f095c871c  unifont_upper-15.0.06.ttf
```

Copyright © 1998–2023 Roman Czyborra, Paul Hardy, Qianqian Fang, Andrew Miller,
Johnnie Weaver, David Corbett, Nils Moskopp, Rebecca Bettencourt, Minseo Lee,
et al. Compiled fonts are dual-licensed: SIL Open Font License 1.1 or GPL with
the font embedding exception. The license texts are included alongside them.

These are broad-coverage fallback fonts, not a promise of every possible Unicode
character or full complex-script shaping. Unsupported glyphs cause an explicit
export error rather than silently discarding research text. The regression suite
checks mixed Latin/CJK/emoji text with decoded ToUnicode mappings.

`next.config.ts` explicitly traces these assets into project API deployments.
