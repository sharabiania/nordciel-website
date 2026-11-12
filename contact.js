// Contact details assembled at runtime so the address never appears as plain
// text (or as a mailto: link) in the HTML, JS or locale files that scrapers read.
// Each part is stored as reversed character codes.
const PARTS = [[111, 102, 110, 105], [108, 101, 105, 99, 100, 114, 111, 110], [109, 111, 99]];
const decode = (p) => String.fromCharCode(...[...p].reverse());

export const email = () => `${decode(PARTS[0])}@${decode(PARTS[1])}.${decode(PARTS[2])}`;
export const openMail = () => { window.location.href = `${'mai'}${'lto'}:${email()}`; };

export const INSTAGRAM_URL = 'https://www.instagram.com/nordcielinc/';
export const INSTAGRAM_HANDLE = '@nordcielinc';

/** Fill <a data-email> elements (text + click) once the page runs. */
export function applyEmailLinks(root = document) {
  root.querySelectorAll('[data-email]').forEach((a) => {
    a.textContent = email();
    a.href = '#';
    if (!a.dataset.emailBound) {
      a.dataset.emailBound = '1';
      a.addEventListener('click', (e) => { e.preventDefault(); openMail(); });
    }
  });
}
