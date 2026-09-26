// V5 research only. US Eastern wall-clock -> UTC with an explicit DST rule (2007+ rules).
function nthSunday(year, month0, n) {
  const d = new Date(Date.UTC(year, month0, 1));
  const first = (7 - d.getUTCDay()) % 7 + 1;
  return first + 7 * (n - 1);
}
export function isEDT(year, month0, day, hourET) {
  const start = Date.UTC(year, 2, nthSunday(year, 2, 2), 2);
  const end = Date.UTC(year, 10, nthSunday(year, 10, 1), 2);
  const t = Date.UTC(year, month0, day, hourET);
  return t >= start && t < end;
}
export function etToUtc(dateStr, hh, mm) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const edt = isEDT(y, m - 1, d, hh);
  const offset = edt ? 4 : 5;
  return { iso: new Date(Date.UTC(y, m - 1, d, hh + offset, mm)).toISOString(), tz: edt ? 'EDT' : 'EST' };
}
