import { init } from '@sentry/browser';

// Base.astro catches errors itself, and Bugsink has no use for sessions
const skip = ['GlobalHandlers', 'BrowserApiErrors', 'BrowserSession'];

init({
  dsn: import.meta.env.PUBLIC_SENTRY_DSN,
  sendClientReports: false,
  dataCollection: { userInfo: false },
  integrations: (all) => all.filter(({ name }) => !skip.includes(name)),
});

export { captureException } from '@sentry/browser';
