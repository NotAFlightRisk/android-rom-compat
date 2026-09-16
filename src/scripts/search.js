const LIMIT = 8;
let pagefind;

const loadPagefind = async (url) => {
  pagefind ??= import(/* @vite-ignore */ url).then(async (module) => {
    await module.init();
    return module;
  });
  return pagefind;
};

const resultItem = ({ url, meta }) => {
  const item = document.createElement('li');
  const link = Object.assign(document.createElement('a'), { href: url });
  const hint = Object.assign(document.createElement('small'), { textContent: meta.hint ?? '' });
  link.append(meta.title, hint);
  item.append(link);
  return item;
};

/** Upgrades a plain search form into live results, and leaves it alone if Pagefind isn't there */
export function enhanceSearch(form) {
  const input = form.querySelector('input');
  const panel = form.querySelector('.results');
  const status = panel.querySelector('[role="status"]');
  const list = panel.querySelector('ul');
  let latest = 0;
  const show = (open) => {
    panel.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
  };
  const close = () => {
    latest++;
    show(false);
  };

  input.addEventListener('input', async () => {
    const query = input.value.trim();
    const run = ++latest;
    if (!query) return show(false);
    try {
      const search = await (await loadPagefind(form.dataset.siteSearch)).debouncedSearch(query);
      if (!search || run !== latest) return;
      const results = await Promise.all(
        search.results.slice(0, LIMIT).map((result) => result.data()),
      );
      if (run !== latest) return;
      list.replaceChildren(...results.map(resultItem));
      status.textContent = results.length ? `${search.results.length} found` : 'Nothing found';
      show(true);
    } catch {
      close();
    }
  });

  form.addEventListener('keydown', (event) => {
    const links = [...list.querySelectorAll('a')];
    const at = links.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      close();
      input.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (panel.hidden || !links.length) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = at + step;
      (next < 0 ? input : links[Math.min(next, links.length - 1)]).focus();
    }
  });

  form.addEventListener('focusout', (event) => {
    if (!form.contains(event.relatedTarget)) close();
  });
}
