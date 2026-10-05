import { init } from '@sentry/browser';

init({
  dsn: import.meta.env.PUBLIC_SENTRY_DSN,
  sendClientReports: false,
  integrations: (all) => all.filter(({ name }) => name !== 'BrowserSession'),
});
