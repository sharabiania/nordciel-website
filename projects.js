// Portfolio shown in the Work section, grouped by category.
//
// To add a project: add an entry to a category below, then add its words under
// work.projects.<id> in every locales/<lang>.json (title, body, optional status)
// and a matching <article> in the index.html fallback.
// To add a category: add it here, plus work.categories.<id> in the locales.
//
//   id    key under work.projects in the locale files
//   kind  label shown above the title, from work.kinds in the locale files
//   icon  card emblem: a star system from ICONS in main.js
//   url   optional: makes the card clickable (opens in a new tab)
//   link  label for that link, from work.links in the locale files

export const CATEGORIES = [
  {
    id: 'games',
    projects: [
      { id: 'riotCity', kind: 'roblox', icon: 'binary' },
      { id: 'movingDay', kind: 'webGame', icon: 'giant' },
    ],
  },
  {
    id: 'apps',
    projects: [
      { id: 'canadaPaycheque', kind: 'android', icon: 'trio' },
      { id: 'pianotes', kind: 'android', icon: 'ringed' },
      { id: 'speedReader', kind: 'webApp', icon: 'outer' },
    ],
  },
];
