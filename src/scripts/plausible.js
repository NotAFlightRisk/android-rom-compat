const PAUSE = 2000;
let timer, flush;

/** Sends a Plausible event, or quietly doesn't on a build without it */
export const track = (name, props) => window.plausible?.(name, { props });

/** One Search event per pause in typing, and the words only when nothing turned up */
export function trackSearch(query, found) {
  clearTimeout(timer);
  flush = () => {
    clearTimeout(timer);
    flush = undefined;
    track('Search', found ? { found: 'yes' } : { found: 'no', term: query.toLowerCase() });
  };
  timer = setTimeout(flush, PAUSE);
}

addEventListener('visibilitychange', () => document.hidden && flush?.());
