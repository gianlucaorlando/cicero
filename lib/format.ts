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

export function candidateLetter(index: number) {
  return String.fromCharCode(65 + index);
}
