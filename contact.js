// Contact details assembled at runtime so the address never appears as plain
// text (or as a mailto: link) in the HTML, JS or locale files that scrapers read.
// Each part is stored as reversed character codes.
const PARTS = [[111, 102, 110, 105], [108, 101, 105, 99, 100, 114, 111, 110], [109, 111, 99]];
const decode = (p) => String.fromCharCode(...[...p].reverse());

export const email = () => `${decode(PARTS[0])}@${decode(PARTS[1])}.${decode(PARTS[2])}`;
/** Open the visitor's mail app, optionally with a prefilled subject and body. */
export const openMail = ({ subject, body } = {}) => {
  const q = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean);
  window.location.href = `${'mai'}${'lto'}:${email()}${q.length ? `?${q.join('&')}` : ''}`;
};

// Social profiles, shown as icons only (no text labels). To add a network,
// add an entry here, a matching glyph in SOCIAL_ICONS (main.js) and an inline
// SVG link in the index.html / privacy.html fallbacks. `label` is the
// accessible name / tooltip.
export const SOCIALS = [
  { id: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/nordcielinc/' },
  { id: 'linkedin', label: 'LinkedIn', url: 'https://www.linkedin.com/company/nordciel/' },
];

/**
 * Fill <a data-email> elements (text + click) once the page runs. Links with
 * their own data-i18n text keep it; data-email-subject / data-email-body
 * prefill the message (set them with data-i18n-attr to translate them).
 */
export function applyEmailLinks(root = document) {
  root.querySelectorAll('[data-email]').forEach((a) => {
    if (!a.hasAttribute('data-i18n')) a.textContent = email();
    a.href = '#';
    if (!a.dataset.emailBound) {
      a.dataset.emailBound = '1';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        openMail({ subject: a.dataset.emailSubject, body: a.dataset.emailBody });
      });
    }
  });
}
