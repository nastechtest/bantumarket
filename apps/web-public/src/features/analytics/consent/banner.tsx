/**
 * The consent banner — the POPIA s18 disclosure a buyer actually sees, and the only place in this
 * feature where "how it looks" is a legal property rather than taste.
 *
 * Rules that make it compliant rather than merely present:
 *  · **Equal prominence for refuse.** Same size, same weight, same row, refuse first in the DOM order
 *    so a keyboard and a screen-reader user meet it before accept. A banner whose "Accept" is a button
 *    and whose "Manage" is a grey text link is a dark pattern with a privacy policy attached.
 *  · **No dismiss-without-answering.** There is no close control. Scrolling, tapping the backdrop and
 *    navigating away all leave the banner in place, because an unanswered banner means *no processing*
 *    (the record denies by default) and pretending otherwise converts avoidance into consent.
 *  · **The disclosure is in the banner, not behind it.** What we would collect and why, per category,
 *    in the same words `lawful-basis.ts` holds. s11(3)(a) consent is only "informed" if it is readable
 *    at the moment of choice.
 *  · **A failed save says so.** If storage rejected the write, the banner says the choice holds for
 *    this visit only. A confirmation that lies about persistence is worse than no confirmation: the
 *    buyer stops being asked and believes they were answered.
 *
 * Nothing here imports the scene runtime, the router, i18n or forms. Copy is English-first with i18n
 * keys recorded in `lawful-basis.ts` for the integration pass. // CONTRACT-GAP: `@nastech/i18n`
 * (brief 19) is written concurrently; wire `t()` in at integration.
 */
import { useCallback, useSyncExternalStore } from 'react';
import type { ConsentRecord } from '../../../lib/consent/types.js';
import { raw, tokens } from '@nastech/design-tokens';
import { LAWFUL_BASIS } from './lawful-basis.js';
import type { ConsentManager } from './store.js';

export interface ConsentBannerProps {
  readonly consent: ConsentManager;
  readonly onOpenPreferences?: () => void;
  /** Called after any decision is recorded, so the app can rotate the session and capture attribution. */
  readonly onDecision?: (record: ConsentRecord) => void;
  readonly policyHref?: string;
  readonly noticeHref?: string;
}

/**
 * Pure and exported for tests: the banner is a *function of the record*, so "does it appear after a
 * decision" and "does it come back when the notice changed" are checkable without a DOM.
 */
export function bannerShouldShow(record: ConsentRecord, currentNoticeVersion: string): boolean {
  if (record.noticeVersion !== currentNoticeVersion) return true;
  return record.version === 0 || record.decisions.length < 3;
}

export const CONSENT_SUMMARY_LINES: readonly string[] = [
  LAWFUL_BASIS.measurement.purpose,
  LAWFUL_BASIS.quality.purpose,
];

const styles = {
  root: {
    position: 'fixed' as const,
    inset: 'auto 0 0 0',
    zIndex: 90,
    background: tokens.surface.primary,
    borderTop: `1px solid ${raw.color.ink100}`,
    boxShadow: `0 -8px 24px ${raw.color.ink900}14`,
    padding: `${raw.space.s4} ${raw.space.s4} calc(${raw.space.s4} + env(safe-area-inset-bottom))`,
    color: tokens.text.primary,
    fontFamily: raw.type.familyText,
    fontSize: '15px',
    lineHeight: 1.45,
  },
  inner: { maxWidth: tokens.layout.contentMax, margin: '0 auto' },
  heading: { margin: `0 0 ${raw.space.s2}`, fontSize: '17px', fontWeight: 600, fontFamily: raw.type.familyDisplay },
  body: { margin: `0 0 ${raw.space.s3}`, color: tokens.text.secondary, maxWidth: '68ch' },
  row: { display: 'flex', flexWrap: 'wrap' as const, gap: raw.space.s2, alignItems: 'center' },
  /** One shared button shape: the parity of accept and refuse is a compliance requirement, so it is a constant, not two hand-written styles. */
  action: {
    flex: '1 1 140px',
    minWidth: '140px',
    minHeight: '44px',
    padding: `${raw.space.s3} ${raw.space.s4}`,
    borderRadius: raw.radius.md,
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    border: `1px solid ${raw.color.accent600}`,
    background: raw.color.accent600,
    color: tokens.text.onInverse,
  },
  secondary: {
    flex: '1 1 140px',
    minWidth: '140px',
    minHeight: '44px',
    padding: `${raw.space.s3} ${raw.space.s4}`,
    borderRadius: raw.radius.md,
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    border: `1px solid ${raw.color.ink100}`,
    background: tokens.surface.primary,
    color: tokens.text.primary,
  },
  link: { color: tokens.action.default, background: 'none', border: 'none', padding: raw.space.s1, font: 'inherit', cursor: 'pointer', textDecoration: 'underline' },
  note: { margin: `${raw.space.s2} 0 0`, fontSize: '13px', color: tokens.text.secondary },
  warn: { color: raw.color.signalCaution },
} as const;

export function ConsentBanner(props: ConsentBannerProps): React.ReactElement | null {
  const { consent } = props;

  const subscribe = useCallback((change: () => void) => consent.subscribe(change), [consent]);
  const record = useSyncExternalStore(subscribe, consent.snapshot, consent.snapshot);

  if (!bannerShouldShow(record, consent.record().noticeVersion)) return null;

  function decide(kind: 'accept' | 'refuse'): void {
    // Refuse first: the order the actions are applied in is the order the record shows them in, and a
    // buyer who refuses must not have "granted" written a millisecond before it.
    const ok = kind === 'accept' ? consent.acceptAll('banner') : consent.refuseAll('banner');
    props.onDecision?.(consent.record());
    if (!ok) {
      // `persisted()` is false: the state is live for this page load, and the copy below says so.
      void 0;
    }
  }

  return (
    <section
      aria-labelledby="consent-banner-title"
      aria-describedby="consent-banner-body"
      role="region"
      data-testid="consent-banner"
      style={styles.root}
    >
      <div style={styles.inner}>
        <h2 id="consent-banner-title" style={styles.heading}>
          Your privacy choices
        </h2>
        <p id="consent-banner-body" style={styles.body}>
          We can count two things about how you use NasTech Market: which steps you take when you buy
          or list an item, and whether the 3D view could actually be shown to you. We do not need them
          to let you use the site, we will not sell them, and every number we keep is a category or a
          range — never a word you typed, never an amount you paid, never a phone number.{' '}
          {LAWFUL_BASIS.essential.processing}
        </p>

        <div style={styles.row}>
          <button
            type="button"
            style={styles.secondary}
            onClick={() => decide('refuse')}
            data-testid="consent-refuse"
          >
            Refuse optional measurement
          </button>
          <button
            type="button"
            style={styles.action}
            onClick={() => decide('accept')}
            data-testid="consent-accept"
          >
            Accept
          </button>
        </div>

        <div style={{ ...styles.row, marginTop: raw.space.s2 }}>
          <button
            type="button"
            style={styles.link}
            onClick={props.onOpenPreferences}
            data-testid="consent-manage"
            aria-haspopup="dialog"
          >
            Choose each one separately
          </button>
          <a href={props.policyHref ?? '/privacy-notice'} style={styles.link}>
            Read the privacy notice
          </a>
        </div>

        <p style={styles.note}>
          Nothing is collected before you choose, and you can withdraw at any time — withdrawing also
          discards events we had gathered but not yet sent.
          {!consent.persisted() && (
            <span style={styles.warn} data-testid="consent-storage-warning">
              {' '}
              This device is not letting us save your choice, so we will ask again next visit.
            </span>
          )}
        </p>
      </div>
    </section>
  );
}
