/** Every date in the data is a plain YYYY-MM-DD, so everything that makes one comes through here */
export const isoDate = (value = Date.now()) => new Date(value).toISOString().slice(0, 10);

export const today = isoDate();
