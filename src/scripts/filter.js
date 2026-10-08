const ranks = {
  newest: (item) => Number(item.dataset.released ?? 0),
  roms: (item) => (item.dataset.rom ?? '').split(' ').filter(Boolean).length,
};

/** Gathers the cards into one list, best first, or puts them back in their groups as they were */
function cardSorter(grid, items) {
  const homes = items.map((item) => [item, item.parentElement]);
  const group = Object.assign(document.createElement('section'), { className: 'group sorted' });
  const list = group.appendChild(document.createElement('ul'));
  grid.prepend(group);
  return (rank) => {
    if (rank) list.append(...items.toSorted((a, b) => rank(b) - rank(a)));
    else for (const [item, home] of homes) home.append(item);
  };
}

/** The Filters button opens the tray of dropdowns, and counts how many of them are in use */
function filterTray(form) {
  const toggle = form.querySelector('[aria-expanded]');
  if (!toggle) return () => {};
  const tray = document.getElementById(toggle.getAttribute('aria-controls'));
  const tally = toggle.querySelector('[data-tally]');
  const clear = tray.querySelector('[data-clear]');
  toggle.addEventListener('click', () => {
    toggle.setAttribute('aria-expanded', tray.hidden);
    tray.hidden = !tray.hidden;
  });
  return (inUse) => {
    tally.textContent = inUse;
    tally.hidden = clear.hidden = inUse === 0;
  };
}

/**
 * Filters the [data-search] items in every list a FilterBar controls (cards and table rows),
 * mirrored into the URL. Each select matches the item's space-separated data attribute of the
 * same name, and ended items are hidden by CSS until "Include ended support" is ticked. The
 * order select sorts the cards; the table sorts by its headers
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
  const order = form.elements.order;
  const filters = selects.filter((select) => select !== order);
  const ended = form.elements.ended;
  const count = form.querySelector('[data-count]');
  const empty = form.querySelector('[data-empty]');
  const emptyEnded = form.querySelector('[data-empty-ended]');
  const showInUse = filterTray(form);
  const params = new URLSearchParams(location.search);

  query.value = params.get('q') ?? '';
  for (const select of selects) {
    select.value = params.get(select.name) ?? '';
    if (select.selectedIndex < 0) select.value = '';
  }
  if (ended) ended.checked = params.get('ended') === '1';

  const matches = (item, text) =>
    item.dataset.search.includes(text) &&
    filters.every(
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
    showInUse(filters.filter((select) => select.value).length + Number(ended?.checked ?? 0));
  }

  const sortCards = cardSorter(first, lists[0]);
  let sortedBy = '';
  function sort() {
    if (order.value === sortedBy) return;
    sortedBy = order.value;
    sortCards(ranks[sortedBy]);
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

  function update() {
    apply();
    sort();
    save();
  }

  function clear() {
    query.value = '';
    for (const select of filters) select.value = '';
    if (ended) ended.checked = false;
    update();
  }

  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('input', update);
  const clears = form.querySelectorAll('[data-clear]');
  clears.forEach((button) => button.addEventListener('click', clear));
  form.querySelector('[data-show-ended]')?.addEventListener('click', () => {
    ended.checked = true;
    update();
  });
  apply();
  sort();
}
