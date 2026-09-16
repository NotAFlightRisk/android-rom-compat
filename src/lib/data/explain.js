import { listOf } from '../text.js';

export const pathOf = (pointer, extra) =>
  [...pointer.split('/').slice(1), ...(extra ? [extra] : [])].reduce((out, part) => {
    if (/^\d+$/.test(part)) return `${out}[${part}]`;
    return out ? `${out}.${part}` : part;
  }, '');

const typeNames = { boolean: 'true or false', integer: 'a whole number', number: 'a number' };

export function explain({ keyword, params, data, parentSchema }) {
  const shown = JSON.stringify(data);
  switch (keyword) {
    case 'required':
      return 'is missing';
    case 'additionalProperties':
      return `"${params.additionalProperty}" isn't a field we know, check the spelling`;
    case 'enum':
      return `${shown} isn't allowed. Use ${listOf(params.allowedValues)}`;
    case 'type':
      return `should be ${typeNames[params.type] ?? `a ${params.type}`}`;
    case 'format':
      return params.format === 'date'
        ? `${shown} isn't a real date. Use YYYY-MM-DD, like 2026-08-01`
        : `${shown} isn't a full link, like https://example.com`;
    case 'pattern':
      return parentSchema.format === 'uri'
        ? `${shown} isn't a full link, like https://example.com`
        : `${shown} can only use ${parentSchema.description}`;
    case 'maxLength':
      return `is ${data.length} characters, keep it to ${params.limit}`;
    case 'minItems':
      return `needs at least ${params.limit}`;
    case 'uniqueItems':
      return `has ${JSON.stringify(data[params.j])} twice`;
    case 'anyOf':
      return 'should be a status, or { status, note }';
    default:
      return `${shown} ${ajvMessage(keyword, params)}`;
  }
}

const ajvMessage = (keyword, { limit }) =>
  ({
    minimum: `is too small, the lowest is ${limit}`,
    maximum: `is too big, the highest is ${limit}`,
    minLength: "can't be empty",
  })[keyword] ?? `breaks the "${keyword}" rule`;
