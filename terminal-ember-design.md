---
version: "superdesign-alpha"
name: "Terminal Ember"
description: "A near-black developer-tool dark mode built on monospace labels and a radial ember accent rationed to hero and footer, interrupted by a single cream editorial band."
colors:
  background: "#181818"
  surface: "#252422"
  surface-deep: "#030302"
  text-primary: "#FBFAF9"
  text-ink-on-light: "#0C0B09"
  text-secondary: "#898580"
  border: "#151513"
  accent: "#FF6542"
  accent-border: "#FF6543"
typography:
  display-lg:
    fontFamily: "rinterFont"
    fontSize: "48px"
    fontWeight: 500
    lineHeight: "1.05"
    letterSpacing: "-1.2px"
  headline-md:
    fontFamily: "rinterFont"
    fontSize: "40px"
    fontWeight: 500
    lineHeight: "1"
    letterSpacing: "-1px"
  body-md:
    fontFamily: "GeistMono"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "1.15"
  label-md:
    fontFamily: "GeistMono"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "1.5"
  accent-script:
    fontFamily: "kalamFont"
    fontStyle: "italic/handwritten"
    role: "annotation callouts over diagrams and small circled words"
  ui-sans:
    fontFamily: "GeistSans"
    role: "secondary UI labels"
spacing:
  base: "4px"
  gap: "10px"
  section-padding: "80px"
rounded:
  control: "6px"
  card: "16px"
  panel: "12px"
  pill: "9999px"
components:
  button-hero-primary:
    background: "#FBFAF9"
    gradient-overlay: "linear-gradient(to top, rgba(0, 0, 0, 0) 0%, oklab(0.324978 -0.000130832 0.00539741 / 0.05) 100%)"
    text-color: "#353431"
    radius: "9999px"
    height: "36px"
    padding: "0px 20px 0px 16px"
    hover-background: "#FBF9F9"
  button-nav-cta:
    background: "#FF6542"
    gradient-overlay: "linear-gradient(to top, rgba(0, 0, 0, 0) 0%, oklab(0.999994 0.0000455678 0.0000200868 / 0.075) 100%)"
    text-color: "#FFFFFF"
    radius: "9999px"
    height: "32px"
    padding: "0px 16px"
  button-dark-solid:
    background: "#353431"
    gradient-overlay: "linear-gradient(to top, rgba(0, 0, 0, 0) 0%, oklab(0.985581 0.000689238 0.00159878 / 0.05) 100%)"
    text-color: "#FBFAF9"
    radius: "9999px"
    height: "32px"
    padding: "0px 16px"
    hover-background: "#151513"
  button-secondary-square:
    background: "#FBFAF9"
    gradient-overlay: "linear-gradient(to top, rgba(0, 0, 0, 0) 0%, oklab(0.324978 -0.000130832 0.00539741 / 0.05) 100%)"
    text-color: "#353431"
    radius: "8px"
    height: "32px"
    padding: "0px 10px"
    hover-background: "#FBF9F9"
  card-tab-panel:
    background: "#252422"
    radius: "12px"
    border: "1px solid #151513"
    padding: "0px"
  card-feature-row:
    background: "transparent"
    radius: "0px"
    padding: "0px"
  card-note-founder:
    background: "#FBFAF9"
    text-color: "#0C0B09"
    radius: "16px"
    padding: "40px"
---
# Terminal Ember
Source: https://expand.ai/

## Overview
A monospace-led, dark-mode-default developer-tool aesthetic built for engineers, not marketers. The system is near-black across its whole length (`#181818` body, `#030302` panel depths), broken only by a radial ember glow confined to the hero's center and a single full-bleed coral band at the footer. Typography is almost entirely GeistMono at a dense 13px for body and UI copy, lending a terminal/CLI register; rinterFont supplies the only large, humanist display moments. A handwritten kalamFont script appears sparingly as hand-annotated callouts pointing at diagrams — the system's one informal gesture inside an otherwise rigid, bordered, technical frame.

## Composition
The first screen opens on a centered navbar (bounded, not edge-to-edge) over a near-black field, with a radial halo blooming directly behind the headline — the page's only saturated moment above the fold, confined to roughly the hero's center third. Below the fold, an interactive tabbed console panel (file-tab chrome, dark input field, three example chips) anchors the page in product-demo realism rather than marketing copy. Scrolling further: a muted grayscale logo strip ("trusted by") on pure black, then a textured dot-grid band introducing a two-column toggle (one label in coral, one in gray) above a flat illustrative card. Mid-page content alternates text-left/diagram-right panels at full measure, each with a small pixel-glyph icon marking its start. A getting-started console block sits beside a vertically offset stack of cream note-cards (the page's one light-mode interruption, serif-free but warmer and editorial in tone) before the footer's full-bleed coral band closes the page with an oversized outlined wordmark. Density is low and generous — wide vertical gaps, single-column reading rhythm — trading grid density for a long scroll of sequential proof.
**Deliberate choice:** color is rationed to two anchors (hero glow, footer band) rather than distributed as recurring accent chips throughout the body — this keeps the long middle section monochrome and lets the ember read as a rare punctuation mark, not a repeated highlight; the rejected alternative would tint every section header or icon coral, diluting the accent's authority.

## Colors
`#181818` is the dominant body background (~53% of pixels), with `#000000` (~11%) at deeper card recesses and the logo-strip band. `#303018` (~19%) is the olive-tinted dark-grain texture overlay visible across mid-page sections. `#FF6048`/`#FF6542` (~7%) is the single accent hue — the hero's radial glow, the nav CTA fill, underline accents, icon glyphs, and the footer's full-bleed surface — never used for body text or structural chrome. `#F0F0F0`/`#FBFAF9` (~2%) is reserved for the hero's primary button and the two cream note-cards, functioning as a "paper" surface role distinct from the UI's dark surfaces. Text ink is `#FBFAF9` on dark surfaces and `#0C0B09` on the cream card; `#898580` serves as the muted secondary/caption tone throughout (nav secondary links, body copy, metadata). Borders are near-invisible hairlines at `#151513`, occasionally replaced by the accent `#FF6543` for emphasis outlines. Nothing is given a second accent hue — the entire chromatic budget outside grayscale is this one coral.

## Typography
GeistMono at 13px/500 carries nearly all running copy — labels, body paragraphs, input placeholders, button text, footer links — giving the whole system a console/terminal voice regardless of content type. rinterFont at 48px/500 (ls -1.2px) is reserved for the hero headline and the cream note-card's heading; 40px/500 (ls -1px) rinterFont marks secondary section headlines mid-page. GeistSans appears as a secondary sans for select UI chrome. kalamFont, an italic/handwritten accent face, is used exclusively for small annotation phrases layered directly on diagrams and toggles — never in running text — making it the system's signature flourish at a tiny fraction of body size. Eyebrows are small all-caps GeistMono in the muted tone, tracked wide, sitting above every major headline.

## Layout
Max-width content column sits near 1440px with 80px section padding. The dominant layout is single-column stacked sections (confirmed by the 1-column/3-item full-width row grid), not a multi-column card grid — this is a narrative scroll, not a dashboard. Where multi-column structure does appear, it is sparse: a 2-column 50/50 split (toggle or comparison pairing) and a 24-column micro-grid used for fine alignment of a 5-item row (17/100/33/33/17 spans) — likely the tabbed-panel chrome plus its content well. Feature explanations use a repeating full-width-panel + icon + heading + body composition, rows running one after another at ~94% width each (effectively a vertical list of three, not a grid). Checklist/numbered content near the page end uses a 4-item heading+list+body composition, each full width. Spacing is tight and code-like at the micro level (4px/10px increments) but generous at the macro level (80px section gaps), creating a dense-content/loose-rhythm contrast typical of technical documentation sites.

## Components
- **Navbar**: centered, bounded (not edge-to-edge) rounded rectangle sitting inset from the viewport edges at the very top of a black page, flat dark fill with a hairline border, logo mark at far left, four text links (secondary GeistMono/sans tone `#898580`) plus a glass search affordance and the solid coral CTA pill at far right — the navbar bar itself is NOT edge-to-edge, it floats as a wide inset block with uniform corner rounding.
- **Hero primary CTA**: observed near-white/cream solid pill (`#FBFAF9`-family fill, gradient-overlay `linear-gradient(to top, rgba(0,0,0,0) 0%, oklab(0.324978 -0.000130832 0.00539741 / 0.05) 100%)`), text `#353431`, fully pill-rounded (9999px), 36px tall, padding `0px 20px 0px 16px`, resting inset highlight + soft outer shadow per spec — this is the single most emphasized control on the first screen, sitting directly under the headline.
- **Nav CTA (secondary role)**: solid coral pill `#FF6542`, text white, 9999px radius, 32px tall, `0px 16px` padding — a distinct, smaller-emphasis variant living only in the navbar, not to be confused with the hero primary.
- **Dark solid button**: `#353431` fill with subtle light gradient overlay, cream text, 9999px pill, 32px tall — used mid-page as a secondary action beside the dark-fill console panels; hover darkens to `#151513`.
- **Square utility button**: cream fill, 8px radius (not pill), 32px tall, `0px 10px` padding — a tighter, slightly-rounded control for compact in-panel actions (e.g. "view setup guide" role), visually distinct from the pill-shaped CTAs.
- **Tabbed console/demo panel**: appears once, mid-hero-adjacent, as the dominant interactive artifact — dark surface `#252422`-family, 12px-radius rounded panel, hairline border, file-tab row at top (three faux window dots + four text tabs), an input field with placeholder copy and a small coral circular submit button, three clickable example chips below arranged in a row.
- **Logo strip**: full-width black band, one centered caption line above four grayscale monochrome logo marks in a single row — pure trust-signal row, no cards or borders.
- **Feature-icon row (×3)**: repeating full-width panels (~94% width each, stacked, not side-by-side) each pairing a small pixel-glyph icon, a bold heading line, and a muted body line — a vertical list, not a horizontal card grid.
- **Diagram/annotation panel**: large dark canvas area holding a flow-style illustration (document icon, connecting line, circular endpoint) with a small handwritten kalamFont caption floating beside it — appears mid-page twice as the primary visual proof device.
- **Code/demo split panel**: two-column technical mockup (code snippet left, "answer" callout right) showing an input/output comparison, framed in dark bordered rectangles with monospace content.
- **Checklist card family (×4)**: heading + list + body composition, full-width stacked rows, used near page end for feature/benefit enumeration — no card chrome (fill transparent, radius 0, no border), relying purely on typographic rhythm.
- **Getting Started console block**: bounded panel with tab row (five tabs), heading, body copy, and two buttons side by side — the dark-solid button and the square-cream-utility button together, demonstrating the two non-primary variants paired.
- **Founder note card**: a light surface island breaking the dark system — `#FBFAF9` background, 16px radius, generous ~40px padding, stacked slightly offset behind a duplicate card edge (paper-stack effect), eyebrow label in muted ink, large rinterFont heading, body copy in `#0C0B09` with italic emphasis phrases inline — the system's sole light-mode card.
- **Footer**: full-bleed coral (`#FF6542`-family) band, four-column link list (Product/Developers/Company/Community) in white GeistMono, a "backed by" credit line below, a status pill (dot + label) bottom-left, legal links bottom-right, and a massive outlined wordmark lockup spanning the full width at the very bottom in black-on-coral.

## Graphics & Effects
A conic-gradient sweep (`conic-gradient(from 180deg, rgba(255,255,255,0.03) -63.87deg, rgba(255,255,255,0.03) 75.05deg, rgba(255,255,255,0.85) 91.39deg, rgba(255,255,255,0.03) 105.97deg, rgba(255,255,255,0.05) 244.6deg, rgba(255,255,255,0.2) 269.37deg, rgba(255,255,255,0.03) 296.13deg, rgba(255,255,255,0.03) 435.05deg)`) renders as a thin rotating rim-light ring behind the hero's central circular glow — this covers the large hero disc, not the full page, giving the black hero its single bright arc highlight. A smaller secondary conic variant repeats the same rim treatment at reduced scale elsewhere. A radial coral wash (`radial-gradient(at 50% 0%, rgba(255,101,66,0.13), rgba(0,0,0,0) 20%)`) sits behind the hero headline only, fading to transparent by 20% of its container — this is the "ember" and it is rationed to roughly the top third of the first screen, not a page-wide tint. A cyan-tinted radial (`color(srgb 0.0313725 0.741176 0.741176 / 0.07)`) appears as a faint secondary wash in one lower section, barely perceptible. A repeating 1px linear-gradient (`repeating-linear-gradient(rgba(3,3,2,0.85) 0px, rgba(3,3,2,0.85) 1px, rgba(3,3,2,0) 1px, rgba(3,3,2,0) 2px)`) produces the fine dot/line grain texture visible as vertical hairline striping across mid-page dark bands and the footer's top edge — treat as a subtle noise/scanline texture, not a solid fill. Two `canvas` elements drive live animated detail in the hero (orbiting particle dots, faint star-field flecks) — substitute a static radial-glow PNG with scattered light dots when rebuilding. Card and panel shadows are soft and multi-layered umber tones (`oklch(0.0959089 ... / 0.09) 0px 4px 8px -1px` stacking through `0px 58px 23px -2px`), giving floated panels a diffuse, low-contrast elevation rather than a hard drop shadow. Backdrop blur (`blur(8px)`, `blur(2px)`) is used on the navbar's glass search affordance and similar frosted overlays.

## Motion
Interactive color/transform changes resolve fast and snappy: `0.15s cubic-bezier(0.4, 0, 0.2, 1)` governs opacity, transform (translate/scale/rotate), and color/background/border transitions on buttons, links, and toggles. A slower `0.3s cubic-bezier(0, 0, 0.2, 1)` governs larger compound state changes. Named keyframe animations — `hero-text-reveal`, `faulty-blink`, `loading-sweep`, `anim-icon-pixel`, `glitch`, `glitch-icon` — point to a glitch/terminal motion vocabulary: headline text likely assembles with a staggered reveal, small pixel-glyph icons flicker or blink on load/hover, and a sweeping loading-bar effect animates within the console panel. This motion language reinforces the monospace/CLI identity — mechanical, flickering, terminal-born — rather than soft springy easing.

## Guardrails
- Never fill the hero or any full section with a saturated coral background — coral is rationed to the hero's central glow, the nav CTA, and the footer band only.
- Do not substitute the measured glass nav search control's values for the hero primary CTA — the hero's main action is the near-white pill button, not a blur/glass variant.
- Keep body and label copy in GeistMono; do not default long-form text to a humanist sans — the monospace voice is structural to this identity.
- Preserve the navbar as a centered, inset, uniformly-rounded bounded bar — do not stretch it edge-to-edge.
- Reserve kalamFont strictly for short handwritten annotations beside diagrams; never use it for headings or body paragraphs.
- Keep the founder-note card as the only light-surface (`#FBFAF9`) moment in the body; do not lighten other mid-page panels to match it.