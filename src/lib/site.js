export const site = {
  name: 'Android ROM Compat',
  url: 'https://android-rom-compat.peng.ly',
  repo: 'https://github.com/NotAFlightRisk/android-rom-compat',
};

export const nav = [
  { label: 'Devices', url: '/devices/' },
  { label: 'ROMs', url: '/roms/' },
];

export const editUrl = (file) => `${site.repo}/edit/main/${file.slice(file.indexOf('data/'))}`;
export const issueUrl = (template) => `${site.repo}/issues/new?template=${template}.yml`;

// Shown at the end of the about page
export const relatedApps = [
  {
    slug: 'fineprint',
    name: 'fineprint',
    about: 'A VPN comparison with no affiliate links and a source for every claim',
    url: 'https://fineprint.peng.ly',
  },
  {
    slug: 'awesome-privacy-guide',
    name: 'Awesome Privacy Guide',
    about: 'Private alternatives to the apps you use every day',
    url: 'https://awesomeprivacy.peng.ly',
  },
  {
    slug: 'exitformat',
    name: 'Exit Format',
    about: 'How to take your data with you when you leave an app',
    url: 'https://exitformat.peng.ly',
  },
  {
    slug: 'enshittification',
    name: 'The Enshittification Index',
    about: 'A dated, sourced record of big tech making things worse',
    url: 'https://enshittification.peng.ly',
  },
];
