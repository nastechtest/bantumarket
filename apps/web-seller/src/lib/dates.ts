/**
 * Seller-facing SAST dates. Fixtures carry absolute ISO instants with a +02:00 offset, so the
 * formatter never has to guess the seller's device timezone and a payout date cannot shift by a
 * day because an operations laptop sits in another hemisphere.
 */

const DATE = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Africa/Johannesburg',
});

const DATE_TIME = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Africa/Johannesburg',
});

const TIME = new Intl.DateTimeFormat('en-ZA', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Africa/Johannesburg',
});

function instant(iso: string): Date | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms);
}

export function sastDate(iso: string): string {
  const date = instant(iso);
  return date === null ? iso : DATE.format(date);
}

export function sastDateTime(iso: string): string {
  const date = instant(iso);
  return date === null ? iso : DATE_TIME.format(date);
}

export function sastTime(iso: string): string {
  const date = instant(iso);
  return date === null ? iso : TIME.format(date);
}
