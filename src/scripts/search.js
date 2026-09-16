const LIMIT = 8;
let pagefind;

const loadPagefind = async () => {
  const url = '/pagefind/pagefind.js';
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
  const close = () => (panel.hidden = true);

  input.addEventListener('input', async () => {
    const query = input.value.trim();
    if (!query) return close();
    try {
      const search = await (await loadPagefind()).debouncedSearch(query);
      if (!search || input.value.trim() !== query) return;
      const results = await Promise.all(search.results.slice(0, LIMIT).map((result) => result.data()));
      list.replaceChildren(...results.map(resultItem));
      status.textContent = results.length ? `${search.results.length} found` : 'Nothing found';
      panel.hidden = false;
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
