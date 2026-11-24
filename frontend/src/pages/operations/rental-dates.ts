export function defaultRentalStartDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)!.value);
  const day = new Date(Date.UTC(number('year'), number('month') - 1, number('day')));
  if (number('hour') >= 16) day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}
