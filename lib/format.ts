export function humanReviewCount(value: number) {
  return new Intl.NumberFormat('it-IT', { notation: value >= 10_000 ? 'compact' : 'standard' }).format(value);
}

export function formatRating(value: number) {
  return value.toFixed(1).replace('.', ',');
}

export function savedRouteDate(value: string) {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? value.slice(0, 10)
    : date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function localTimeLabel(date = new Date()) {
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

/** Adds minutes to an HH:mm label, wrapping at midnight. */
export function shiftTime(value: string, minutes: number) {
  const [hours, mins] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return value;
  const total = (((hours * 60 + mins + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function priceLabel(value: string | null) {
  return ({
    PRICE_LEVEL_FREE: 'gratis',
    PRICE_LEVEL_INEXPENSIVE: '€',
    PRICE_LEVEL_MODERATE: '€€',
    PRICE_LEVEL_EXPENSIVE: '€€€',
    PRICE_LEVEL_VERY_EXPENSIVE: '€€€€',
  } as Record<string, string>)[value || ''] || null;
}

export function pluralStops(count: number) {
  return `${count} ${count === 1 ? 'tappa' : 'tappe'}`;
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
];

/** "2 settimane fa", "ieri", "un mese fa": how long ago, in words. */
export function relativeTimeLabel(iso: string, now = Date.now()) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const elapsed = Math.max(0, now - time);
  const format = new Intl.RelativeTimeFormat('it', { numeric: 'auto' });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (elapsed >= size) return format.format(-Math.floor(elapsed / size), unit);
  }
  return 'poco fa';
}

export function candidateLetter(index: number) {
  return String.fromCharCode(65 + index);
}
