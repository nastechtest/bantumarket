import { useState } from 'react';
import type { FormEvent } from 'react';
import { raw, tokens } from '@nastech/design-tokens';

/**
 * POPIA access / correction / deletion request. Reachable without an account on purpose: the
 * right to see or remove your information cannot depend on still being signed in.
 *
 * This build has no privacy-desk endpoint, so the form does not pretend to send. It validates,
 * states exactly what it is about to hand back, and renders a reference the person can keep. On a
 * build wired to the API the same payload goes to the privacy queue; the wording below says what
 * happened here rather than promising an inbox.
 */

type RequestKind = 'access' | 'correction' | 'deletion';

const KIND_LABELS: Readonly<Record<RequestKind, string>> = {
  access: 'A copy of the personal information you hold about me',
  correction: 'Correct personal information that is wrong',
  deletion: 'Delete personal information you no longer need',
};

interface Receipt {
  readonly reference: string;
  readonly kind: RequestKind;
  readonly name: string;
}

export function DataRequestPage() {
  const [kind, setKind] = useState<RequestKind>('access');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [detail, setDetail] = useState('');
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const next: string[] = [];
    if (name.trim().length < 2) next.push('Give the name the account or request is under.');
    if (contact.trim().length < 5) next.push('Leave an email address or phone number we can reply to.');
    if (kind === 'correction' && detail.trim().length < 20) {
      next.push('For a correction, say which field is wrong and what it should say.');
    }
    setErrors(next);
    if (next.length > 0) return;
    setReceipt({
      reference: `POPIA-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
      kind,
      name: name.trim(),
    });
  }

  if (receipt !== null) {
    return (
      <section
        data-testid="data-request-receipt"
        aria-label="Data request prepared"
        style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '66ch', display: 'grid', gap: raw.space.s4 }}
      >
        <h1 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.6rem' }}>Request prepared</h1>
        <p style={{ margin: 0 }}>
          Reference <strong>{receipt.reference}</strong> — {KIND_LABELS[receipt.kind]} for{' '}
          <strong>{receipt.name}</strong>.
        </p>
        <p style={{ margin: 0, padding: raw.space.s3, background: raw.color.paperWarm, borderRadius: raw.radius.md }}>
          This build keeps the request in this tab only. Nothing has been sent to a server and no
          data has left your device. Keep the reference: the privacy desk can use it once the
          request reaches them through the configured channel.
        </p>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>What a proper request triggers</h2>
        <ul style={{ margin: 0, paddingInlineStart: '1.2rem', fontSize: '0.9375rem' }}>
          <li style={{ marginBottom: raw.space.s2 }}>
            We confirm it is you before releasing an access copy or deleting anything. A request
            from someone else’s phone is not proof of identity.
          </li>
          <li style={{ marginBottom: raw.space.s2 }}>
            An access copy is free once a year; a correction fixes the record, but a true safety
            report about conduct stays.
          </li>
          <li>
            Deletion removes what we no longer need. Order, payment and tax records stay for as long
            as the law and the ledger require them — deleting a receipt does not unmake a sale.
          </li>
        </ul>
        <p style={{ margin: 0 }}>
          <a href="/safety/policy/popia" style={{ color: tokens.action.default, fontWeight: 600 }}>
            Read what safety records we keep, and why
          </a>
          {' · '}
          <a href="/account" style={{ color: tokens.action.default, fontWeight: 600 }}>Back to your account</a>
        </p>
        <button
          type="button"
          onClick={() => { setReceipt(null); setErrors([]); }}
          style={{ justifySelf: 'start', padding: `${raw.space.s2} ${raw.space.s4}`, border: `1px solid ${raw.color.ink300}`, borderRadius: raw.radius.sm, background: tokens.surface.primary, color: tokens.text.primary, fontFamily: raw.type.familyText, cursor: 'pointer' }}
        >
          Prepare another request
        </button>
      </section>
    );
  }

  return (
    <section
      data-testid="data-request-page"
      aria-label="Access or delete your information"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '66ch', display: 'grid', gap: raw.space.s4 }}
    >
      <header>
        <h1 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.6rem' }}>
          Access or delete your information
        </h1>
        <p style={{ margin: `${raw.space.s2} 0 0`, color: tokens.text.secondary }}>
          POPIA gives you the right to know what personal information we hold, to correct it, and to
          ask for it to be deleted when it is no longer needed. You do not need to be signed in to
          ask.
        </p>
      </header>

      <form onSubmit={submit} noValidate style={{ display: 'grid', gap: raw.space.s3 }}>
        <fieldset style={{ border: `1px solid ${raw.color.ink100}`, borderRadius: raw.radius.md, padding: raw.space.s3 }}>
          <legend style={{ fontWeight: 600, paddingInline: raw.space.s2 }}>What are you asking for?</legend>
          {(Object.keys(KIND_LABELS) as RequestKind[]).map((value) => (
            <label key={value} style={{ display: 'flex', gap: raw.space.s2, alignItems: 'baseline', marginBlock: raw.space.s2 }}>
              <input
                type="radio"
                name="request-kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
              />
              <span>{KIND_LABELS[value]}</span>
            </label>
          ))}
        </fieldset>

        <label style={{ display: 'grid', gap: raw.space.s1 }}>
          <span style={{ fontWeight: 600 }}>Name on the account or request</span>
          <input
            type="text"
            value={name}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'grid', gap: raw.space.s1 }}>
          <span style={{ fontWeight: 600 }}>Email address or phone number</span>
          <input
            type="text"
            value={contact}
            autoComplete="email"
            onChange={(e) => setContact(e.target.value)}
            style={inputStyle}
          />
          <span style={{ fontSize: '0.8125rem', color: tokens.text.secondary }}>
            Used only to answer this request. It is not added to marketing.
          </span>
        </label>

        <label style={{ display: 'grid', gap: raw.space.s1 }}>
          <span style={{ fontWeight: 600 }}>
            Details {kind === 'correction' ? '(required: which field, and what it should say)' : '(optional)'}
          </span>
          <textarea
            value={detail}
            rows={4}
            onChange={(e) => setDetail(e.target.value)}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </label>

        {errors.length > 0 ? (
          <ul role="alert" data-testid="data-request-errors" style={{ margin: 0, paddingInlineStart: '1.2rem', color: raw.color.signalNegative }}>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}

        <button
          type="submit"
          style={{ justifySelf: 'start', padding: `${raw.space.s3} ${raw.space.s5}`, border: `1px solid ${tokens.action.default}`, borderRadius: raw.radius.sm, background: tokens.action.default, color: raw.color.paper, fontWeight: 600, fontFamily: raw.type.familyText, cursor: 'pointer' }}
        >
          Prepare the request
        </button>
      </form>

      <section aria-labelledby="data-request-next" style={{ display: 'grid', gap: raw.space.s2 }}>
        <h2 id="data-request-next" style={{ margin: 0, fontSize: '1.05rem' }}>Before you send anything</h2>
        <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.9375rem' }}>
          Never put an ID number, a bank card number or a handover code in this form. Those are
          exactly the details a support request does not need.
        </p>
        <p style={{ margin: 0, fontSize: '0.9375rem' }}>
          <a href="/legal/privacy" style={{ color: tokens.action.default, fontWeight: 600 }}>Privacy notice</a>
          {' · '}
          <a href="/safety/policy/popia" style={{ color: tokens.action.default, fontWeight: 600 }}>Safety records and retention</a>
        </p>
      </section>
    </section>
  );
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: `${raw.space.s2} ${raw.space.s3}`,
  border: `1px solid ${raw.color.ink300}`,
  borderRadius: raw.radius.sm,
  background: tokens.surface.primary,
  color: tokens.text.primary,
  fontFamily: raw.type.familyText,
  fontSize: '1rem',
} as const;
