# Curb Crew — marketing site

A single-page marketing site for a residential trash-can valet service. Static HTML/CSS/JS with GSAP + ScrollTrigger for motion. No build step.

## Files
- `index.html` — all markup (8 sections + nav + footer)
- `styles.css` — 3-color design system, responsive, reduced-motion
- `main.js` — GSAP animations, count-up, confetti, form handling

## Run locally
Just open `index.html` in a browser. Or serve it:
```bash
npx serve .        # or: python3 -m http.server
```

## Deploy
Static site — drop the folder on Vercel, Netlify, GitHub Pages, or any host. No config needed.

## Swap the brand name
Search the project for `Curb Crew` and replace. The wordmark appears in:
- `index.html` nav (`<span class="wordmark__text">`), footer, `<title>`, and meta tags
- Elements tagged `data-brand` / `data-brand-text` are the brand text spots

The blue logo glyph is inline SVG inside each `.wordmark__mark` — swap that SVG to change the mark.

## Customize
- **Colors** — top of `styles.css`, `:root` (`--black`, `--white`, `--blue`)
- **Pricing / add-ons** — `#pricing` section in `index.html`
- **Stats** — `data-countup` / `data-suffix` attributes in the `#stats` section
- **Form** — currently a placeholder. `[data-address-form]` in `main.js` validates input and shows a success state + confetti. Wire `form.addEventListener("submit", ...)` to a real endpoint (Formspree, your API, etc.) to capture leads.

## Accessibility / performance
- Semantic HTML, skip link, visible focus states, ARIA on dynamic regions
- Respects `prefers-reduced-motion` (motion is disabled/toned down)
- Magnetic/3D hover effects are pointer-only (skipped on touch)
- Fonts and GSAP load from CDN; everything else is local
