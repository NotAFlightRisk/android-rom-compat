import { fittingRoms, prepare, search } from '../lib/search.js';
import { lockTone, unlockWords } from '../lib/facts.js';
import { labelOf } from '../lib/labels.js';
import { listOf, plural } from '../lib/text.js';

const PAGE = 48;

const element = (tag, props, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter(Boolean));
  return node;
};

const status = (tone, text) => {
  const node = element('span', { className: 'status', textContent: text });
  node.dataset.tone = tone;
  return node;
};

/** A device result, laid out like the cards on the device lists */
function card(device, roms, romNames) {
  const meta = element(
    'p',
    { className: 'meta' },
    element('code', { textContent: device.codenames[0] }),
    device.released && element('span', { textContent: device.released }),
    device.type !== 'phone' && element('span', { textContent: labelOf(device.type) }),
  );
  const chips = element(
    'ul',
    { className: 'badges' },
    ...roms.map((rom) => element('li', { className: 'badge', textContent: romNames[rom] })),
  );
  chips.setAttribute('aria-label', 'ROMs');
  const empty = device.ended
    ? status('ended', 'Support has ended')
    : !roms.length && status('empty', 'No ROMs yet');
  return element(
    'li',
    { className: 'card' },
    element('a', { className: 'stretch', href: device.url, textContent: device.name }),
    meta,
    device.unlock !== 'unknown' && status(lockTone[device.unlock], unlockWords[device.unlock]),
    roms.length > 0 && chips,
    empty,
  );
}

/** "12 devices on LineageOS where VoLTE is known to work" */
function summary(count, named, catalogue) {
  const names = (keys, items) => keys.map((key) => items.find((item) => item.key === key).name);
  const roms = names(named.roms, catalogue.roms);
  const features = names(named.features, catalogue.features);
  const verb = features.length > 1 ? 'are' : 'is';
  return [
    plural(count, 'device'),
    roms.length && `on ${listOf(roms, 'and')}`,
    features.length && `where ${listOf(features, 'and')} ${verb} known to work`,
  ]
    .filter(Boolean)
    .join(' ');
}

const termFrom = (path) => {
  try {
    return decodeURIComponent(path.split('/')[2] ?? '');
  } catch {
    return '';
  }
};

/**
 * Searches everything in /search.json as you type, mirrored into the URL, so /search/pixel%207a/
 * opens on that search. Until it loads, the page lists the ROMs, brands and features to browse
 */
export async function enhanceFinder(form) {
  const input = form.elements.q;
  const fields = [...form.querySelectorAll('select, [type="checkbox"]')];
  const count = document.querySelector('[data-count]');
  const shortcuts = [...document.querySelectorAll('.shortcuts')];
  const devices = document.querySelector('[data-kind="devices"]');
  const list = devices.querySelector('ul');
  const more = document.querySelector('[data-more]');
  const empty = document.querySelector('[data-empty]');
  const title = document.title;
  const params = new URLSearchParams(location.search);
  let catalogue, romNames, found, named, shown;

  input.value = termFrom(location.pathname) || (params.get('q') ?? '');
  for (const field of fields) {
    if (field.type === 'checkbox') field.checked = params.get(field.name) === '1';
    else field.value = params.get(field.name) ?? '';
    if (field.selectedIndex < 0) field.value = '';
  }

  const filtersOf = () =>
    Object.fromEntries(
      fields.map((field) => [field.name, field.type === 'checkbox' ? field.checked : field.value]),
    );

  function showMore() {
    const next = found.slice(shown, shown + PAGE);
    list.append(
      ...next.map((device) =>
        card(device, fittingRoms(device, named.roms, named.features), romNames),
      ),
    );
    shown += next.length;
    more.hidden = shown >= found.length;
    more.textContent = `Show ${Math.min(PAGE, found.length - shown)} more`;
  }

  function save(query, filters) {
    const path = query ? `/search/${encodeURIComponent(query.replaceAll('/', ' '))}/` : '/search/';
    const url = new URL(path, location.origin);
    for (const [name, value] of Object.entries(filters)) {
      if (value) url.searchParams.set(name, value === true ? '1' : value);
    }
    history.replaceState(history.state, '', url);
    document.title = query ? `${query} - ${title}` : title;
  }

  function update() {
    const query = input.value.trim();
    const filters = filtersOf();
    const results = search(catalogue, query, filters);
    const browsing = !query && !Object.values(filters).some(Boolean);
    for (const group of shortcuts) {
      const keys = results[group.dataset.kind];
      const items = [...group.querySelectorAll('[data-key]')];
      for (const item of items) item.hidden = !browsing && !keys.includes(item.dataset.key);
      group.hidden = items.every((item) => item.hidden);
    }
    ({ devices: found, named } = results);
    shown = 0;
    list.replaceChildren();
    showMore();
    devices.hidden = !found.length;
    empty.hidden = browsing || found.length > 0 || shortcuts.some((group) => !group.hidden);
    count.textContent = browsing ? '' : summary(found.length, named, catalogue);
    save(query, filters);
  }

  count.textContent = 'Loading...';
  try {
    catalogue = prepare(await (await fetch('/search.json')).json());
  } catch {
    count.textContent = "Search didn't load, so refresh to try again.";
    return;
  }
  romNames = Object.fromEntries(catalogue.roms.map((rom) => [rom.key, rom.name]));
  form.addEventListener('input', update);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    input.blur();
  });
  more.addEventListener('click', showMore);
  update();
}
