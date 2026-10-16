import { getModel } from '../lib/data/model.js';
import { buildIndex } from '../lib/search.js';

export const GET = () => Response.json(buildIndex(getModel()));
