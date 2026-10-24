import type { CSSProperties, ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import type { AuditStamp } from './audit-stamp.js';
import { auditStampLine } from './audit-stamp.js';
import type { Capability } from './permissions.js';
import { roleToAsk } from './permissions.js';
import { formatCount } from './time.js';

const bodyText: CSSProperties = { fontFamily: raw.type.familyText, fontSize: '0.875rem', color: tokens.text.primary };
const secondaryText: CSSProperties = { ...bodyText, color: tokens.text.secondary };

export function PageHeader({
  title,
  kicker,
  actions,
  children,
}: {
  title: string;
  kicker?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s3, padding: `${raw.space.s5} 0 ${raw.space.s4}` }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: raw.space.s3, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          {kicker ? <p style={{ ...secondaryText, margin: 0, fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{kicker}</p> : null}
          <h1 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.75rem', color: tokens.text.primary }}>{title}</h1>
        </div>
        {actions ? <div style={{ display: 'flex', gap: raw.space.s2, flexWrap: 'wrap' }}>{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}

export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s3, padding: `${raw.space.s4} 0` }}>
      <h2 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.125rem', color: tokens.text.primary }}>{title}</h2>
      {children}
    </section>
  );
}

export function Panel({ title, tone = 'neutral', children }: { title?: string; tone?: 'neutral' | 'caution' | 'negative'; children: ReactNode }) {
  const edge = tone === 'negative' ? raw.color.signalNegative : tone === 'caution' ? raw.color.signalCaution : raw.color.ink100;
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: raw.space.s2,
        background: tokens.surface.raised,
        border: `1px solid ${raw.color.ink100}`,
        borderLeft: `3px solid ${edge}`,
        borderRadius: raw.radius.md,
        padding: raw.space.s4,
        ...bodyText,
      }}
    >
      {title ? <h3 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1rem' }}>{title}</h3> : null}
      {children}
    </section>
  );
}

export function LoadingPanel({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      data-state="loading"
      style={{ padding: raw.space.s5, background: tokens.surface.raised, borderRadius: raw.radius.md, ...secondaryText }}
    >
      {label}…
    </div>
  );
}

export function EmptyPanel({ title, body, actionLabel, onAction }: { title: string; body?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <section
      data-state="empty"
      style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s2, alignItems: 'flex-start', padding: raw.space.s5, background: tokens.surface.raised, borderRadius: raw.radius.md, ...bodyText }}
    >
      <h3 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1rem' }}>{title}</h3>
      {body ? <p style={{ ...secondaryText, margin: 0 }}>{body}</p> : null}
      {actionLabel && onAction ? <ActionButton label={actionLabel} onClick={onAction} /> : null}
    </section>
  );
}

export function ErrorPanel({ title = 'That did not load', body, onRetry, retryLabel = 'Try again' }: { title?: string; body: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <section
      role="alert"
      data-state="error"
      style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s2, alignItems: 'flex-start', padding: raw.space.s5, background: tokens.surface.raised, borderLeft: `3px solid ${raw.color.signalNegative}`, borderRadius: raw.radius.md, ...bodyText }}
    >
      <h3 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1rem' }}>{title}</h3>
      <p style={{ ...secondaryText, margin: 0 }}>{body}</p>
      {onRetry ? <ActionButton label={retryLabel} onClick={onRetry} /> : null}
    </section>
  );
}

export function OfflinePanel({ onRetry, children }: { onRetry?: () => void; children?: ReactNode }) {
  return (
    <section
      role="status"
      data-state="offline"
      style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s2, alignItems: 'flex-start', padding: raw.space.s5, background: tokens.surface.raised, borderLeft: `3px solid ${raw.color.signalCaution}`, borderRadius: raw.radius.md, ...bodyText }}
    >
      <h3 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1rem' }}>You are offline</h3>
      <p style={{ ...secondaryText, margin: 0 }}>
        Nothing on this screen can be changed until the connection returns. No action has been queued.
      </p>
      {children}
      {onRetry ? <ActionButton label="Check again" onClick={onRetry} /> : null}
    </section>
  );
}

/**
 * The permission refusal. It names the capability and the role that grants it, and nothing about
 * any record — a 403 that says "case not found" is an existence oracle.
 */
export function PermissionPanel({ capability }: { capability: Capability }) {
  return (
    <section
      role="alert"
      data-state="permission-denied"
      data-capability={capability}
      style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s2, padding: raw.space.s5, background: tokens.surface.raised, borderLeft: `3px solid ${raw.color.signalNegative}`, borderRadius: raw.radius.md, ...bodyText }}
    >
      <h3 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1rem' }}>Your role does not include this</h3>
      <p style={{ ...secondaryText, margin: 0 }}>
        This screen requires the capability <code>{capability}</code>. Ask someone with the <strong>{roleToAsk(capability)}</strong> role to grant it.
      </p>
    </section>
  );
}

export function SignInRequiredPanel() {
  return (
    <section data-state="signed-out" style={{ ...bodyText, padding: raw.space.s5, background: tokens.surface.raised, borderRadius: raw.radius.md }}>
      <h3 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1rem' }}>Sign in to use the console</h3>
      <p style={{ ...secondaryText, margin: `${raw.space.s2} 0` }}>Staff actions are attributed. Sign in with your staff account and a second factor.</p>
      <a href="/sign-in" style={{ color: tokens.action.default }}>Go to sign in</a>
    </section>
  );
}

export function MfaRequiredPanel() {
  return (
    <section role="alert" data-state="mfa-required" style={{ ...bodyText, padding: raw.space.s5, background: tokens.surface.raised, borderLeft: `3px solid ${raw.color.signalNegative}`, borderRadius: raw.radius.md }}>
      <h3 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1rem' }}>A second factor is required</h3>
      <p style={{ ...secondaryText, margin: `${raw.space.s2} 0` }}>
        This session has not completed a second factor. The console will not show or change anything until it has.
      </p>
      <a href="/sign-in" style={{ color: tokens.action.default }}>Sign in again</a>
    </section>
  );
}

export function SessionEndedPanel({ impersonating = false }: { impersonating?: boolean }) {  const copy = impersonating
    ? 'The support session ended. Return to your own session before anything else.'
    : 'Your session ended. Sign in again.';
  return (
    <section role="alert" data-state="session-ended" style={{ ...bodyText, padding: raw.space.s5, background: tokens.surface.raised, borderLeft: `3px solid ${raw.color.signalNegative}`, borderRadius: raw.radius.md }}>
      <h3 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1rem' }}>Session ended</h3>
      <p style={{ ...secondaryText, margin: `${raw.space.s2} 0` }}>{copy}</p>
      <a href="/sign-in" style={{ color: tokens.action.default }}>Sign in</a>
    </section>
  );
}

export function Notice({ tone, title, children }: { tone: 'info' | 'caution' | 'negative' | 'positive'; title?: string; children: ReactNode }) {
  const edge = tone === 'negative' ? raw.color.signalNegative : tone === 'caution' ? raw.color.signalCaution : tone === 'positive' ? tokens.assurance.disclosed : raw.color.ink300;
  return (
    <div
      role={tone === 'negative' || tone === 'caution' ? 'alert' : 'status'}
      data-tone={tone}
      style={{ borderLeft: `3px solid ${edge}`, background: tokens.surface.raised, padding: raw.space.s3, borderRadius: raw.radius.sm, ...bodyText }}
    >
      {title ? <strong style={{ display: 'block', marginBottom: raw.space.s1 }}>{title}</strong> : null}
      {children}
    </div>
  );
}

export interface ActionButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Shown, not just a tooltip: a disabled control must say why. */
  /** `undefined` is a legal argument: `disabled ? reason : undefined` is how callers state it. */
  disabledReason?: string | undefined;
  tone?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
  type?: 'button' | 'submit';
  testId?: string;
}

export function ActionButton({ label, onClick, disabled = false, disabledReason, tone = 'primary', busy = false, type = 'button', testId }: ActionButtonProps) {
  const background = tone === 'primary' ? tokens.action.default : tone === 'danger' ? raw.color.signalNegative : 'transparent';
  const color = tone === 'secondary' ? tokens.text.primary : tokens.text.onInverse;
  const isDisabled = disabled || busy;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: raw.space.s1, alignItems: 'flex-start' }}>
      <button
        type={type}
        onClick={onClick}
        disabled={isDisabled}
        data-tone={tone}
        {...(testId ? { 'data-testid': testId } : {})}
        style={{
          background,
          color,
          border: tone === 'secondary' ? `1px solid ${raw.color.ink300}` : 'none',
          borderRadius: raw.radius.sm,
          padding: `${raw.space.s2} ${raw.space.s4}`,
          fontFamily: raw.type.familyText,
          fontSize: '0.875rem',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.65 : 1,
        }}
      >
        {busy ? `${label}…` : label}
      </button>
      {isDisabled && disabledReason ? (
        <span role="note" style={{ ...secondaryText, fontSize: '0.75rem' }}>{disabledReason}</span>
      ) : null}
    </span>
  );
}

export function Field({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  type = 'text',
  required = false,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  type?: 'text' | 'password' | 'email' | 'date' | 'number' | 'search';
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
}) {
  const hintId = hint || error ? `${id}-hint` : undefined;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s1, ...bodyText }}>
      <label htmlFor={id} style={{ fontWeight: 600 }}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={hintId}
        onInput={(event) => onChange(event.currentTarget.value)}
        style={{ font: 'inherit', padding: raw.space.s2, border: `1px solid ${raw.color.ink300}`, borderRadius: raw.radius.sm, background: tokens.surface.primary, color: tokens.text.primary }}
      />
      {hint ? <span id={hintId} style={{ ...secondaryText, fontSize: '0.75rem' }}>{hint}</span> : null}
      {error ? <span role="alert" style={{ color: raw.color.signalNegative, fontSize: '0.75rem' }}>{error}</span> : null}
    </div>
  );
}

export function TextArea({ id, label, value, onChange, hint, rows = 3 }: { id: string; label: string; value: string; onChange: (value: string) => void; hint?: string; rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s1, ...bodyText }}>
      <label htmlFor={id} style={{ fontWeight: 600 }}>{label}</label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onInput={(event) => onChange(event.currentTarget.value)}
        style={{ font: 'inherit', padding: raw.space.s2, border: `1px solid ${raw.color.ink300}`, borderRadius: raw.radius.sm, background: tokens.surface.primary, color: tokens.text.primary }}
      />
      {hint ? <span style={{ ...secondaryText, fontSize: '0.75rem' }}>{hint}</span> : null}
    </div>
  );
}

export function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { readonly value: string; readonly label: string }[];
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s1, ...bodyText }}>
      <label htmlFor={id} style={{ fontWeight: 600 }}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={{ font: 'inherit', padding: raw.space.s2, border: `1px solid ${raw.color.ink300}`, borderRadius: raw.radius.sm, background: tokens.surface.primary, color: tokens.text.primary }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {hint ? <span style={{ ...secondaryText, fontSize: '0.75rem' }}>{hint}</span> : null}
    </div>
  );
}

export function CheckRow({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div style={{ display: 'flex', gap: raw.space.s2, alignItems: 'flex-start', ...bodyText }}>
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

export function AuditStampNote({ stamp }: { stamp: AuditStamp }) {
  return (
    <p data-audit-stamp="" style={{ ...secondaryText, fontSize: '0.75rem', margin: 0 }}>
      {auditStampLine(stamp)}
    </p>
  );
}

export function KeyValue({ items, label }: { items: readonly { readonly term: string; readonly detail: ReactNode }[]; label?: string }) {
  return (
    <dl aria-label={label} style={{ display: 'grid', gridTemplateColumns: 'minmax(10rem, max-content) 1fr', gap: `${raw.space.s2} ${raw.space.s4}`, margin: 0, ...bodyText }}>
      {items.map((item) => (
        <div key={item.term} style={{ display: 'contents' }}>
          <dt style={{ color: tokens.text.secondary, fontWeight: 600 }}>{item.term}</dt>
          <dd style={{ margin: 0 }}>{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CursorNav({
  nextCursor,
  canPrevious,
  onNext,
  onPrevious,
  busy = false,
  scanned,
}: {
  nextCursor: string | null;
  canPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
  busy?: boolean;
  scanned?: number;
}) {
  return (
    <nav aria-label="Pages" style={{ display: 'flex', gap: raw.space.s3, alignItems: 'center', flexWrap: 'wrap', ...secondaryText }}>
      <ActionButton
        label="Previous page"
        onClick={onPrevious}
        tone="secondary"
        disabled={!canPrevious || busy}
        disabledReason={!canPrevious ? 'You are on the first page of this range.' : undefined}
      />
      <ActionButton
        label="Next page"
        onClick={onNext}
        tone="secondary"
        disabled={nextCursor === null || busy}
        disabledReason={nextCursor === null ? 'No more rows in this range.' : undefined}
      />
      {typeof scanned === 'number' ? <span>Rows read on this page: {formatCount(scanned)}.</span> : null}
    </nav>
  );
}
