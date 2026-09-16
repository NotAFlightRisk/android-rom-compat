export const slugify = (text) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const listOf = (items, joiner = 'or') =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} ${joiner} ${items.at(-1)}` : `${items[0]}`;
