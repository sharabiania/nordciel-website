# Nordciel website

Landing page for Nordciel: a static site using three.js (loaded from a CDN), hosted on GitHub Pages.

Run it locally: `npx serve .` or `python -m http.server`, then open http://localhost:8000.

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which publishes the site to GitHub Pages.

**Cache busting:** files are referenced with a `?v=__BUILD__` suffix (for example `main.js?v=__BUILD__`).
The deploy workflow replaces `__BUILD__` with the commit id, so every update gets new URLs and
visitors' browsers download the fresh files automatically. When you add a new JS, CSS or JSON file,
reference it with `?v=__BUILD__` too. (Locally the placeholder stays as-is, which works fine.)

## Languages

Text lives in `locales/<lang>.json`. To add a language, copy `en.json`, translate it and add the
code to `LANGUAGES` in `i18n.js`.

## Contact details

The email address is assembled at runtime in `contact.js` and never written in plain text,
to keep it away from spam crawlers. Use `{email}` in locale strings and `data-email` on links.
