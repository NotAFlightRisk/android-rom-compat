const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

const compare = (a, b) => {
  const [x, y] = [Number(a), Number(b)];
  return a && b && !Number.isNaN(x) && !Number.isNaN(y) ? x - y : collator.compare(a, b);
};

const toneRank = { working: 0, partial: 1, ended: 2, broken: 3, unknown: 4, 'n/a': 5 };
const sortValue = (cell) =>
  cell.querySelector('time')?.dateTime ??
  String(toneRank[cell.dataset.tone] ?? (cell.querySelector('a') ?? cell).textContent.trim());

/** Fades the right edge while there's more table to scroll to */
function showScrollCue(scroller) {
  const update = () =>
    scroller.toggleAttribute(
      'data-more',
      scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1,
    );
  scroller.addEventListener('scroll', update, { passive: true });
  new ResizeObserver(update).observe(scroller);
}

/** Adds sorting, filtering and column toggles to a matrix, mirrored into the URL when asked */
export function enhanceMatrix(root) {
  showScrollCue(root.querySelector('.scroller'));
  const controls = root.querySelector('[data-controls]');
  if (!controls) return;

  const table = root.querySelector('table');
  const body = table.tBodies[0];
  const rows = [...body.rows];
  const headers = [...table.tHead.rows[0].cells];
  const keys = headers.map((header) => header.dataset.col);
  const filter = controls.querySelector('[name="q"]');
  const brand = controls.querySelector('[name="brand"]');
  const ended = controls.querySelector('[name="ended"]');
  const toggles = [...controls.querySelectorAll('[name="col"]')];
  const count = controls.querySelector('[data-count]');
  const empty = root.querySelector('[data-empty]');
  const emptyEnded = root.querySelector('[data-empty-ended]');
  const useUrl = root.hasAttribute('data-url-state');
  const params = new URLSearchParams(useUrl ? location.search : '');
  let hiddenColumns;

  let sort = keys.includes((params.get('sort') ?? '').replace(/^-/, '')) ? params.get('sort') : '';
  filter.value = params.get('q') ?? '';
  if (brand) brand.value = params.get('brand') ?? '';
  if (ended) ended.checked = params.get('ended') === '1';
  if (params.has('cols')) {
    const shown = params.get('cols').split(',');
    toggles.forEach((toggle) => (toggle.checked = shown.includes(toggle.value)));
  }

  function showColumns() {
    const selectors = toggles
      .filter((toggle) => !toggle.checked)
      .map(
        (toggle) => `#${CSS.escape(table.id)} tr > :nth-child(${keys.indexOf(toggle.value) + 1})`,
      );
    hiddenColumns ??= root.appendChild(document.createElement('style'));
    hiddenColumns.textContent = selectors.length ? `${selectors.join(',')} { display: none }` : '';
  }

  function filterRows() {
    const query = filter.value.trim().toLowerCase();
    const picked = brand?.value ?? '';
    let shown = 0;
    let onlyEnded = 0;
    for (const row of rows) {
      const matches =
        row.dataset.search.includes(query) && (picked === '' || row.dataset.brand === picked);
      const hide = !matches || (row.dataset.ended !== undefined && !ended?.checked);
      if (row.hidden !== hide) row.hidden = hide;
      if (!hide) shown++;
      else if (matches) onlyEnded++;
    }
    count.textContent =
      shown === rows.length ? `${rows.length} shown` : `${shown} of ${rows.length} shown`;
    empty.hidden = shown > 0 || onlyEnded > 0;
    if (emptyEnded) emptyEnded.hidden = shown > 0 || onlyEnded === 0;
  }

  function sortRows() {
    const index = keys.indexOf(sort.replace(/^-/, ''));
    const direction = sort.startsWith('-') ? -1 : 1;
    headers.forEach((header, i) => {
      if (i === index) header.setAttribute('aria-sort', direction > 0 ? 'ascending' : 'descending');
      else header.removeAttribute('aria-sort');
    });
    if (index < 0) return;
    body.append(
      ...rows.toSorted(
        (a, b) => direction * compare(sortValue(a.cells[index]), sortValue(b.cells[index])),
      ),
    );
  }

  function saveToUrl() {
    if (!useUrl) return;
    const url = new URL(location.href);
    const custom = toggles.some((toggle) => toggle.checked !== toggle.defaultChecked);
    const state = {
      q: filter.value.trim(),
      brand: brand?.value,
      ended: ended?.checked ? '1' : '',
      sort,
      cols: custom
        ? toggles
            .filter((toggle) => toggle.checked)
            .map((toggle) => toggle.value)
            .join(',')
        : '',
    };
    for (const [name, value] of Object.entries(state)) {
      if (value) url.searchParams.set(name, value);
      else url.searchParams.delete(name);
    }
    history.replaceState(null, '', url);
  }

  for (const header of headers) {
    const button = Object.assign(document.createElement('button'), { type: 'button' });
    button.append(...header.childNodes);
    button.addEventListener('click', () => {
      sort = sort === header.dataset.col ? `-${header.dataset.col}` : header.dataset.col;
      sortRows();
      saveToUrl();
    });
    header.append(button);
  }

  const onFilter = () => {
    filterRows();
    saveToUrl();
  };
  filter.addEventListener('input', onFilter);
  brand?.addEventListener('change', onFilter);
  ended?.addEventListener('change', onFilter);
  for (const toggle of toggles) {
    toggle.addEventListener('change', () => {
      showColumns();
      saveToUrl();
    });
  }

  if (toggles.some((toggle) => !toggle.checked || !toggle.defaultChecked)) {
    showColumns();
    table.querySelectorAll('th[hidden], td[hidden]').forEach((cell) => (cell.hidden = false));
  }
  if (filter.value || brand?.value || ended) filterRows();
  if (sort) sortRows();
}
