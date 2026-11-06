// Berlin day and clock: the hub counts days in Europe/Berlin, and visitors read Berlin times.
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
const CLOCK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });

export const berlinDay = (ms) => DAY.format(new Date(ms));

export function berlinClock(iso) {
  const d = new Date(iso);
  return iso && !Number.isNaN(d.getTime()) ? CLOCK.format(d) : '';
}
