import { raw, tokens } from '@nastech/design-tokens';

/**
 * Reasons the human queue actually triages. Each one names a pattern from this market's real
 * complaints — a person describing an over-payment attempt should find their own words waiting.
 */

export interface ReportReason {
  readonly id: string;
  readonly title: string;
  readonly hint: string;
}

export const REPORT_REASONS: readonly ReportReason[] = [
  {
    id: 'payment_proof_mismatch',
    title: 'They sent payment proof — a screenshot, SMS or “confirmation” — and no money landed',
    hint:
      'Bank app screenshots, PayFast/Yoco notification snaps and “the funds clear tomorrow” are all forgeable in seconds. Only a deposit you can see in your own bank app is a deposit.',
  },
  {
    id: 'overpayment_reverse',
    title: 'They paid more than we agreed and want me to send the difference back',
    hint:
      'The classic reversal: the original “payment” is cancelled or was never real, and your refund of the “difference” leaves your own account. Stop, keep the extra money untouched, and report.',
  },
  {
    id: 'off_platform_push',
    title: 'They are pushing the chat off-platform before we have met',
    hint:
      '“My WhatsApp is easier”, “call me, data is expensive” — once the conversation leaves here, the message log that would support your report no longer exists.',
  },
  {
    id: 'fake_courier',
    title: 'Courier story: a printed “label”, or “my courier will collect it”',
    hint:
      'A PDF label proves nothing; anyone can typeset one. Handing a watch to a stranger because they claim someone sent them is how items disappear before any handover code exists.',
  },
  {
    id: 'item_not_as_described',
    title: 'What I saw or received is not the item that was listed',
    hint:
      'Write down the specific difference — engraving, reference number, crystal, service history — in the same words the listing used.',
  },
  {
    id: 'counterfeit_claimed_genuine',
    title: 'The listing sells a replica as genuine',
    hint:
      'Serial plate mismatches, a “Swiss” dial on a R900 watch, service papers with no workshop stamp. Say what you saw.',
  },
  {
    id: 'harassment_threats',
    title: 'Threats, harassment or extortion',
    hint:
      'If you are in danger right now, call SAPS on 10111 first, then report here. This queue does not replace an emergency line.',
  },
  {
    id: 'stolen_goods',
    title: 'I believe this item is stolen',
    hint:
      'Serial numbers scratched off, no original box “because it was a gift”, price far under market for no reason.',
  },
  {
    id: 'other',
    title: 'Something else — I will describe it',
    hint: 'A human reads every report. Detail beats category.',
  },
];

export function reasonById(id: string | null): ReportReason | undefined {
  if (id === null) return undefined;
  return REPORT_REASONS.find((r) => r.id === id);
}

export function ReasonPicker({
  value,
  narrative,
  onChange,
  onNarrativeChange,
  errors,
}: {
  value: string | null;
  narrative: string;
  onChange: (id: string) => void;
  onNarrativeChange: (text: string) => void;
  errors: readonly string[];
}) {
  return (
    <fieldset
      className="safety-report-reason"
      style={{ border: 'none', margin: 0, padding: 0, fontFamily: raw.type.familyText }}
    >
      <legend style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: raw.space.s3 }}>
        What happened?
      </legend>
      {REPORT_REASONS.map((reason) => (
        <label
          key={reason.id}
          style={{ display: 'block', marginBottom: raw.space.s3, cursor: 'pointer' }}
        >
          <span style={{ display: 'flex', gap: raw.space.s2, alignItems: 'baseline' }}>
            <input
              type="radio"
              name="report-reason"
              checked={value === reason.id}
              onChange={() => onChange(reason.id)}
            />
            <span>{reason.title}</span>
          </span>
          {value === reason.id ? (
            <span
              style={{
                display: 'block',
                marginInlineStart: '1.4rem',
                marginTop: raw.space.s1,
                fontSize: '0.85rem',
                color: tokens.text.secondary,
              }}
            >
              {reason.hint}
            </span>
          ) : null}
        </label>
      ))}
      <div style={{ marginTop: raw.space.s4 }}>
        <label htmlFor="report-narrative" style={{ display: 'block', fontWeight: 600, marginBottom: raw.space.s2 }}>
          Your account of it (at least 40 characters — a human reads this)
        </label>
        <textarea
          id="report-narrative"
          rows={5}
          value={narrative}
          onChange={(e) => onNarrativeChange(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            fontFamily: raw.type.familyText,
            fontSize: '0.95rem',
            padding: raw.space.s3,
            border: `1px solid ${raw.color.ink100}`,
            borderRadius: raw.radius.md,
          }}
          placeholder="What was agreed, what happened, when, and what you can show."
        />
        {errors.map((err) => (
          <p key={err} style={{ color: raw.color.signalNegative, fontSize: '0.85rem', margin: `${raw.space.s2} 0 0` }}>
            {err}
          </p>
        ))}
      </div>
    </fieldset>
  );
}
