/**
 * Seller response time. The number is measured; the sentence around it is allowed to be plain but
 * must not be a promise — "usually replies within about 3 hours" is a statistic, "replies within
 * 3 hours" is a guarantee we did not make and cannot enforce. null means no history, and saying
 * that takes a component, not a zero.
 */

import { raw, tokens } from '@nastech/design-tokens';

export function formatResponseTime(hours: number): string {
  if (hours < 1) return 'under an hour';
  if (hours < 2) return 'about an hour';
  if (hours < 24) return `about ${Math.round(hours)} hours`;
  if (hours < 48) return 'about a day';
  return `about ${Math.round(hours / 24)} days`;
}

export function ResponseTime({ hours }: { hours: number | null }) {
  return (
    <p
      className="item-response-time"
      data-has-history={hours !== null ? 'true' : 'false'}
      style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8125rem', fontFamily: raw.type.familyText }}
    >
      {hours === null
        ? 'No response history yet for this seller.'
        : `Usually replies to buyer questions ${formatResponseTime(hours)}.`}
    </p>
  );
}
