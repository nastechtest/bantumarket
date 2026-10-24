/**
 * The consent preferences screen: the mechanism POPIA s11(4) read with s5 requires.
 *
 * What makes it a mechanism instead of a settings page:
 *  · every category states **what is collected, why, on what basis, for how long** — the same
 *    `LAWFUL_BASIS` object the banner and the access-request export print, so the three cannot drift;
 *  · a granted category gets a **Withdraw** control that runs the real withdrawal (`consent/withdraw.ts`),
 *    and reports what it discarded. "You can withdraw anytime" printed next to a toggle that only
 *    flips a flag is the claim this screen exists to make true;
 *  · the `marketing` row is present and shows *not collected* with no control at all. An empty row is
 *    the honest UI for a purpose we do not process for, and it makes adding one a visible product
 *    decision rather than a checkbox someone ticked;
 *  · access (`s22`) and deletion (`s23`) are offered here, on the same screen, because a buyer who can
 *    see the toggles but not the record behind them has been given a preference and not a right.
 */
import { useCallback, useSyncExternalStore } from 'react';
import type { ConsentCategory, ConsentRecord } from '../../../lib/consent/types.js';
import { DECISION_CATEGORIES } from '../../../lib/consent/types.js';
import { raw, tokens } from '@nastech/design-tokens';
import { LAWFUL_BASIS } from './lawful-basis.js';
import type { ConsentManager } from './store.js';

export interface ConsentPreferencesProps {
  readonly consent: ConsentManager;
  /** Runs `withdrawCategory`; the screen prints the result it returns. */
  readonly onWithdraw?: (category: ConsentCategory) => WithdrawalReport;
  /** Runs the erase path (queue emptied, record removed, session dropped). */
  readonly onErase?: () => { removed: number; erased: boolean };
  readonly onExport?: (json: string) => void;
  readonly onClose?: () => void;
}

export interface WithdrawalReport {
  readonly discardedBuffered: number;
  readonly sessionRotated: boolean;
  readonly persisted: boolean;
  readonly failure: string | null;
}

export interface PreferenceRow {
  readonly category: ConsentCategory;
  readonly title: string;
  readonly state: 'granted' | 'refused' | 'not_asked' | 'not_collected' | 'always';
  readonly canToggle: boolean;
  readonly canWithdraw: boolean;
  readonly purpose: string;
  readonly basis: string;
  readonly retention: string;
  readonly events: readonly string[];
  readonly actionLabel: string;
}

/**
 * The rows, as a pure function of the record. Exported because the interesting assertions — "a
 * granted category offers withdrawal", "marketing offers nothing", "an undecided buyer sees
 * not_asked" — are about state, and state should be testable without a renderer.
 */
export function preferenceRows(record: ConsentRecord): PreferenceRow[] {
  const rows: PreferenceRow[] = [];

  for (const category of ['essential', ...DECISION_CATEGORIES] as ConsentCategory[]) {
    const note = LAWFUL_BASIS[category];
    const decision = record.decisions.find((d) => d.category === category);

    if (category === 'essential') {
      rows.push({
        category,
        title: 'Required for the privacy record itself',
        state: 'always',
        canToggle: false,
        canWithdraw: false,
        purpose: note.purpose,
        basis: note.basis,
        retention: note.retention,
        events: note.events,
        actionLabel: 'Not a choice you are asked to make',
      });
      continue;
    }

    if (category === 'marketing') {
      rows.push({
        category,
        title: 'Advertising and profiling',
        state: 'not_collected',
        canToggle: false,
        canWithdraw: false,
        purpose: note.purpose,
        basis: note.basis,
        retention: note.retention,
        events: note.events,
        actionLabel: 'We do not collect this, so there is nothing to switch',
      });
      continue;
    }

    const granted = decision?.value === 'granted';
    rows.push({
      category,
      title: category === 'quality' ? 'App performance and whether 3D could be shown' : 'Buying and listing steps',
      state: decision === undefined ? 'not_asked' : granted ? 'granted' : 'refused',
      canToggle: true,
      // Withdrawal is offered when it is *currently granted* — the wording matters: switching off a
      // refused category is not a withdrawal and must not be reported as one.
      canWithdraw: granted,
      purpose: note.purpose,
      basis: note.basis,
      retention: note.retention,
      events: note.events,
      actionLabel: granted ? 'Withdraw this permission' : decision === undefined ? 'Allow' : 'Allow',
    });
  }
  return rows;
}

const styles = {
  root: { padding: raw.space.s4, fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '68ch' },
  heading: { fontSize: '19px', fontWeight: 600, fontFamily: raw.type.familyDisplay, margin: `0 0 ${raw.space.s2}` },
  intro: { margin: `0 0 ${raw.space.s4}`, color: tokens.text.secondary, fontSize: '14px', lineHeight: 1.5 },
  row: { border: `1px solid ${raw.color.ink100}`, borderRadius: raw.radius.md, padding: raw.space.s4, marginBottom: raw.space.s3 },
  rowHead: { display: 'flex', gap: raw.space.s3, alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap' as const },
  title: { fontSize: '16px', fontWeight: 600, margin: 0 },
  state: { fontSize: '13px', fontWeight: 600, letterSpacing: '0.01em', textTransform: 'uppercase' as const },
  purpose: { fontSize: '14px', lineHeight: 1.5, margin: `${raw.space.s2} 0` },
  meta: { fontSize: '13px', color: tokens.text.secondary, margin: `${raw.space.s1} 0` },
  events: { fontSize: '12px', fontFamily: raw.type.familyMono, color: tokens.text.secondary, margin: `${raw.space.s1} 0 0`, wordBreak: 'break-word' as const },
  button: { minHeight: '44px', padding: `${raw.space.s2} ${raw.space.s4}`, borderRadius: raw.radius.md, border: `1px solid ${raw.color.accent600}`, background: raw.color.accent600, color: tokens.text.onInverse, fontWeight: 600, fontSize: '15px', cursor: 'pointer' },
  ghost: { minHeight: '44px', padding: `${raw.space.s2} ${raw.space.s4}`, borderRadius: raw.radius.md, border: `1px solid ${raw.color.ink100}`, background: tokens.surface.primary, color: tokens.text.primary, fontWeight: 600, fontSize: '15px', cursor: 'pointer' },
  report: { fontSize: '13px', margin: `${raw.space.s2} 0 0`, color: raw.color.signalPositive },
  warn: { color: raw.color.signalCaution },
} as const;

export function ConsentPreferences(props: ConsentPreferencesProps): React.ReactElement {
  const { consent } = props;
  const subscribe = useCallback((change: () => void) => consent.subscribe(change), [consent]);
  const record = useSyncExternalStore(subscribe, consent.snapshot, consent.snapshot);
  const rows = preferenceRows(record);

  return (
    <section aria-labelledby="consent-prefs-title" data-testid="consent-preferences" style={styles.root}>
      <h2 id="consent-prefs-title" style={styles.heading}>
        What we may measure about you
      </h2>
      <p style={styles.intro}>
        Every choice here applies from now on. Withdrawing also deletes the events we had collected and
        not yet sent, and changes the reference we use to count a visit — which means a period before
        and after your withdrawal cannot be joined together by us either.
      </p>

      {rows.map((row) => (
        <div key={row.category} style={styles.row} data-category={row.category}>
          <div style={styles.rowHead}>
            <h3 style={styles.title}>{row.title}</h3>
            <span
              style={{
                ...styles.state,
                color:
                  row.state === 'granted'
                    ? raw.color.signalPositive
                    : row.state === 'refused' || row.state === 'not_collected'
                      ? raw.color.signalNegative
                      : tokens.text.secondary,
              }}
              data-testid={`state-${row.category}`}
            >
              {row.state === 'not_asked' ? 'Not asked yet' : row.state === 'not_collected' ? 'Never collected' : row.state}
            </span>
          </div>

          <p style={styles.purpose}>{row.purpose}</p>
          <p style={styles.meta}>
            <strong>Legal basis:</strong> {row.basis}
          </p>
          <p style={styles.meta}>
            <strong>How long we keep it:</strong> {row.retention}
          </p>
          <p style={styles.events} aria-label="events in this category">
            {row.events.length > 0 ? row.events.join(', ') : 'no events'}
          </p>

          {row.canToggle && (
            <div style={{ display: 'flex', gap: raw.space.s2, marginTop: raw.space.s3, flexWrap: 'wrap' }}>
              <button
                type="button"
                style={row.canWithdraw ? styles.ghost : styles.button}
                data-testid={`toggle-${row.category}`}
                onClick={() => {
                  if (row.canWithdraw) {
                    props.onWithdraw?.(row.category);
                  } else {
                    consent.setDecision(row.category, 'granted', 'preference');
                  }
                }}
              >
                {row.actionLabel}
              </button>
              {row.canWithdraw && (
                <button
                  type="button"
                  style={styles.ghost}
                  data-testid={`regrant-${row.category}`}
                  onClick={() => consent.setDecision(row.category, 'refused', 'preference')}
                >
                  Keep it off instead
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', gap: raw.space.s2, flexWrap: 'wrap', marginTop: raw.space.s3 }}>
        <button
          type="button"
          style={styles.ghost}
          data-testid="consent-export"
          onClick={() => props.onExport?.(consent.exportRecord())}
        >
          Download my consent record
        </button>
        <button type="button" style={styles.ghost} data-testid="consent-erase" onClick={() => props.onErase?.()}>
          Delete my consent record and stop all measurement
        </button>
        {props.onClose && (
          <button type="button" style={styles.ghost} data-testid="consent-close" onClick={props.onClose}>
            Done
          </button>
        )}
      </div>

      {!consent.persisted() && (
        <p style={{ ...styles.meta, ...styles.warn }} data-testid="consent-storage-warning">
          This device is not letting us save your choices. They hold for this visit; we will ask again
          next time.
        </p>
      )}
    </section>
  );
}

/** A row summary the app shell can print in a footer link without rendering the screen. */
export function consentStateLine(record: ConsentRecord): string {
  const granted = record.decisions.filter((d) => d.value === 'granted').map((d) => d.category);
  if (granted.length === 0) return record.version === 0 ? 'You have not chosen yet — nothing optional is collected.' : 'Nothing optional is collected.';
  return `Measuring: ${granted.join(', ')}.`;
}
