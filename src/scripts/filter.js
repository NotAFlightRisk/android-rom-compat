/**
 * Filters the [data-search] items in every list a FilterBar controls (cards and table rows),
 * mirrored into the URL. Each select matches the item's space-separated data attribute of the
 * same name, and ended items are hidden by CSS until "Include ended support" is ticked
 */
export function enhanceFilter(form) {
  const [first, ...others] = form
    .getAttribute('aria-controls')
    .split(' ')
    .map((id) => document.getElementById(id));
  const itemsOf = (list) => [...list.querySelectorAll('[data-search]')];
  const lists = [first, ...others].map(itemsOf);
  const query = form.elements.q;
  const selects = [...form.querySelectorAll('select')];
  const ended = form.elements.ended;
  const count = form.querySelector('[data-count]');
  const empty = form.querySelector('[data-empty]');
  const emptyEnded = form.querySelector('[data-empty-ended]');
  const params = new URLSearchParams(location.search);

  query.value = params.get('q') ?? '';
  for (const select of selects) {
    select.value = params.get(select.name) ?? '';
    if (select.selectedIndex < 0) select.value = '';
  }
  if (ended) ended.checked = params.get('ended') === '1';

  const matches = (item, text) =>
    item.dataset.search.includes(text) &&
    selects.every(
      ({ name, value }) => !value || (item.dataset[name] ?? '').split(' ').includes(value),
    );

  function apply() {
    const text = query.value.trim().toLowerCase();
    for (const items of lists) {
      for (const item of items) item.hidden = !matches(item, text);
    }
    const [items] = lists;
    const showable = items.filter((item) => !item.hidden);
    const shown = showable.filter((item) => ended?.checked || !('ended' in item.dataset)).length;
    count.textContent = shown === items.length ? `${shown} shown` : `${shown} of ${items.length}`;
    empty.hidden = showable.length > 0;
    if (emptyEnded) emptyEnded.hidden = shown > 0 || showable.length === 0;
  }

  function save() {
    const url = new URL(location.href);
    const state = [
      ['q', query.value.trim()],
      ...selects.map(({ name, value }) => [name, value]),
      ['ended', ended?.checked ? '1' : ''],
    ];
    for (const [name, value] of state) {
      if (value) url.searchParams.set(name, value);
      else url.searchParams.delete(name);
    }
    history.replaceState(history.state, '', url);
  }

  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('input', () => {
    apply();
    save();
  });
  apply();
}
