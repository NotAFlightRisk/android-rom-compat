export const site = {
  name: 'Android ROM Compat',
  url: 'https://android-rom-compat.peng.ly',
  repo: 'https://github.com/NotAFlightRisk/android-rom-compat',
};

export const editUrl = (file) => `${site.repo}/edit/main/${file.slice(file.indexOf('data/'))}`;
export const issueUrl = (template) => `${site.repo}/issues/new?template=${template}.yml`;
