/** Every date in the data is a plain YYYY-MM-DD, so everything that makes one comes through here */
export const isoDate = (value = Date.now()) => new Date(value).toISOString().slice(0, 10);

export const today = isoDate();

const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const parts = (date) => date.split('-').map(Number);

/** "2026-10-02" as "2 Oct 2026" */
export const formatDate = (date) => {
  const [year, month, day] = parts(date);
  return `${day} ${MONTHS[month - 1]} ${year}`;
};

/** "2032-04-01" as "Apr 2032" */
export const formatMonth = (date) => {
  const [year, month] = parts(date);
  return `${MONTHS[month - 1]} ${year}`;
};
