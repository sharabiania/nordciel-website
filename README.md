# Nordciel website

Landing page for Nordciel: a static site using three.js (loaded from a CDN), hosted on GitHub Pages.

Run it locally: `npx serve .` or `python -m http.server`, then open http://localhost:8000.

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which publishes the site to GitHub Pages.

**Cache busting:** files are referenced with a `?v=__BUILD__` suffix (for example `main.js?v=__BUILD__`).
The deploy workflow replaces `__BUILD__` with the commit id, so every update gets new URLs and
visitors' browsers download the fresh files automatically. When you add a new JS, CSS or JSON file,
reference it with `?v=__BUILD__` too. (Locally the placeholder stays as-is, which works fine.)

## Motion

All in `main.js`:

- **Flights** between sections follow a curved Bezier path (`go()`), with look-ahead, banking into turns
  and a slightly wider field of view mid-flight. Layout always uses `BASE_FOV`, so the FOV change never
  moves content; the HUD is rescaled each frame to stay the same size.
- **Choreography**: the section you arrive at assembles from depth, top to bottom, with a scan line over
  each panel; the one you leave peels off towards the camera (`choreograph`). Clicks on a section wait
  until it has settled.
- **Hover**: cards and buttons tilt towards the cursor with a glare (`tilt` on hit entries). Card text
  and icons sit on layers above the glass.
- **Card emblems** are small 3D star systems (`starSystem` / `ICONS`, one per card, chosen by
  `WORK_ICONS` / `SERVICE_ICONS`). Hovering a card speeds its orbits up.
- **Camera**: orbit parallax around the content centre, pitch with scroll speed, gentle idle drift.

Visitors with *reduce motion* turned on get plain transitions with none of the above.

## Languages

Text lives in `locales/<lang>.json`. To add a language, copy `en.json`, translate it and add the
code to `LANGUAGES` in `i18n.js`.

## Contact details

The email address is assembled at runtime in `contact.js` and never written in plain text,
to keep it away from spam crawlers. Use `{email}` in locale strings and `data-email` on links.
