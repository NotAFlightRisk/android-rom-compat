const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

const compare = (a, b) => {
  const [x, y] = [Number(a), Number(b)];
  return a !== '' && b !== '' && !Number.isNaN(x) && !Number.isNaN(y) ? x - y : collator.compare(a, b);
};

const sortValue = (row, key) => row.querySelector(`[data-col="${key}"]`)?.dataset.sort ?? '';

/** Adds sorting, filtering and column toggles to a matrix, mirrored into the URL when asked */
export function enhanceMatrix(root) {
  const controls = root.querySelector('[data-controls]');
  if (!controls) return;
  const table = root.querySelector('table');
  const body = table.tBodies[0];
  const rows = [...body.rows];
  const headers = [...table.tHead.rows[0].cells];
  const filter = controls.querySelector('[name="q"]');
  const brand = controls.querySelector('[name="brand"]');
  const toggles = [...controls.querySelectorAll('[name="col"]')];
  const count = controls.querySelector('[data-count]');
  const empty = root.querySelector('[data-empty]');
  const useUrl = root.hasAttribute('data-url-state');
  const params = new URLSearchParams(useUrl ? location.search : '');
  const sortable = headers.map((header) => header.dataset.col);
  let sort = sortable.includes((params.get('sort') ?? '').replace(/^-/, '')) ? params.get('sort') : '';

  filter.value = params.get('q') ?? '';
  if (brand) brand.value = params.get('brand') ?? '';
  if (params.has('cols')) {
    const shown = params.get('cols').split(',');
    toggles.forEach((toggle) => (toggle.checked = shown.includes(toggle.value)));
  }

  for (const header of headers) {
    const button = Object.assign(document.createElement('button'), { type: 'button' });
    button.append(...header.childNodes);
    button.addEventListener('click', () => {
      const key = header.dataset.col;
      sort = sort === key ? `-${key}` : key;
      render();
    });
    header.append(button);
  }

  function render() {
    const query = filter.value.trim().toLowerCase();
    const pickedBrand = brand?.value ?? '';
    const key = sort.replace(/^-/, '');
    const direction = sort.startsWith('-') ? -1 : 1;

    for (const toggle of toggles) {
      table.querySelectorAll(`[data-col="${toggle.value}"]`).forEach((cell) => (cell.hidden = !toggle.checked));
    }
    for (const header of headers) {
      const state = header.dataset.col === key ? (direction > 0 ? 'ascending' : 'descending') : null;
      if (state) header.setAttribute('aria-sort', state);
      else header.removeAttribute('aria-sort');
    }

    const ordered = key ? rows.toSorted((a, b) => direction * compare(sortValue(a, key), sortValue(b, key))) : rows;
    let shown = 0;
    for (const row of ordered) {
      row.hidden = !row.dataset.search.includes(query) || (pickedBrand && row.dataset.brand !== pickedBrand);
      shown += row.hidden ? 0 : 1;
    }
    body.append(...ordered);
    count.textContent = shown === rows.length ? `${rows.length} shown` : `${shown} of ${rows.length} shown`;
    empty.hidden = shown > 0;
    if (useUrl) saveToUrl(query, pickedBrand);
  }

  function saveToUrl(query, pickedBrand) {
    const url = new URL(location.href);
    const defaults = toggles.every((toggle) => toggle.checked === toggle.defaultChecked);
    const state = {
      q: query,
      brand: pickedBrand,
      sort,
      cols: defaults ? '' : toggles.filter((toggle) => toggle.checked).map((toggle) => toggle.value).join(','),
    };
    for (const [name, value] of Object.entries(state)) {
      if (value) url.searchParams.set(name, value);
      else url.searchParams.delete(name);
    }
    history.replaceState(null, '', url);
  }

  filter.addEventListener('input', render);
  brand?.addEventListener('change', render);
  toggles.forEach((toggle) => toggle.addEventListener('change', render));
  controls.hidden = false;
  render();
}
