# AGENTS.md

## Project purpose

This is a static, framework-free Vite application for understanding a two-dimensional linear map
from an input space `V` to an output space `W`. It must remain usable without a backend and deploy
safely at a GitHub Pages repository subpath.

## Mathematical invariants

- `B_V = {e1, e2}` and `B_W = {w1, w2}` are independently user-defined bases.
- Coordinates are columns. For the standard-coordinate map matrix `F`, `P_V = [e1 e2]`, and
  `P_W = [w1 w2]`, the displayed representation is
  `A = [f]_(B_W <- B_V) = P_W^-1 F P_V`.
- The columns of the representation matrix are `[f(e1)]_(B_W)` and `[f(e2)]_(B_W)`.
- All user inputs and derived coordinates use normalized exact rational arithmetic. Do not route
  values through binary floating point before determinants, inverses, or decompositions.
- A candidate basis is singular only when its exact determinant numerator is zero. Keep plotting
  its vectors and all defined ambient images in that state, but do not invent an inverse or
  pseudoinverse.
- Changing `B_W` changes coordinates, never the ambient vectors `f(e1)`, `f(e2)`, or `f(v)`.
  Changing `B_V` changes `e1`, `e2`, and their images, but never the ambient vector `f(v)`.
- Horizontal and vertical model units must render at the same pixel scale, and the two plots must
  share the same bounds.

## Architecture

- Keep DOM wiring, form behavior, theme persistence, and KaTeX rendering in `src/app.ts`.
- Keep state transitions and the fully derived view model in `src/ui/controller.ts`.
- Keep exact arithmetic and linear algebra in `src/math/`.
- Keep coordinate transforms, snapping, ticks, and retained SVG rendering in `src/plot/`.
- Preserve Vite's relative `base: "./"` and the single test/build/deploy workflow.
- Keep `README.md` intentionally minimal: the live-page link and a brief mathematical description.
- Use `https://rayleighlord.github.io/MapFromVtoW/` as the canonical public URL unless the
  repository owner or name changes.

## UX and verification

- Do not communicate bases, columns, or decompositions through color alone; retain visible
  mathematical labels and distinct line styles.
- Preserve atomic form updates: invalid edits must leave the last successfully applied state
  plotted.
- The `V` plot accepts integer-snapped vector selection; the `W` plot stays read-only because the
  map need not be invertible.
- Keep controls and both plots unobscured at desktop, tablet, and mobile breakpoints.
- Preserve semantic forms, status announcements, keyboard submission, visible focus states,
  reduced-motion support, and KaTeX MathML output.
- Run unit tests, typecheck, production build, browser smoke tests, and visual browser inspection
  for interaction or layout changes.
