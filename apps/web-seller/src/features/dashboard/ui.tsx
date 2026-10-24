import { useEffect, useState, type ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';

/**
 * Local presentation primitives. They live in the feature because the seller shell (brief 56)
 * owns `layout/` and `lib/`; nothing here duplicates shell chrome — no header, no nav, no main.
 */

const CARD: React.CSSProperties = {
  background: tokens.surface.primary,
  border: `1px solid ${raw.color.ink100}`,
  borderRadius: raw.radius.lg,
  padding: raw.space.s5,
  display: 'flex',
  flexDirection: 'column',
  gap: raw.space.s3,
};

export function Panel({
  title,
  subtitle,
  actions,
  children,
  id,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section style={CARD} aria-labelledby={id ? `${id}-title` : undefined} data-testid={id}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: raw.space.s3, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <h2 id={id ? `${id}-title` : undefined} style={{ fontSize: '1.125rem' }}>
            {title}
          </h2>
          {subtitle ? <p style={{ margin: `${raw.space.s1} 0 0`, color: tokens.text.secondary, fontSize: '0.875rem' }}>{subtitle}</p> : null}
        </div>
        {actions ? <div style={{ display: 'flex', gap: raw.space.s2 }}>{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export type Tone = 'neutral' | 'progress' | 'success' | 'caution' | 'problem';

const TONE_COLOR: Record<Tone, string> = {
  neutral: raw.color.ink500,
  progress: raw.color.accent600,
  success: raw.color.signalPositive,
  caution: raw.color.signalCaution,
  problem: raw.color.signalNegative,
};

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: raw.space.s1,
        border: `1px solid ${TONE_COLOR[tone]}`,
        color: TONE_COLOR[tone],
        borderRadius: raw.radius.pill,
        padding: `2px ${raw.space.s2}`,
        fontSize: '0.75rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export function LinkButton({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) {
  return (
    <a className={secondary ? 'button secondary' : 'button'} href={href}>
      {children}
    </a>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.875rem' }}>{children}</p>;
}

export function LoadingBlock({ label = 'Loading your dashboard…' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" style={{ ...CARD, alignItems: 'flex-start' }}>
      <p style={{ margin: 0, color: tokens.text.secondary }}>{label}</p>
    </div>
  );
}

/** Error summary is focusable on purpose: a failed load must move the screen reader to the reason. */
export function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section role="alert" tabIndex={-1} data-testid="dashboard-error" style={{ ...CARD, borderColor: raw.color.signalNegative }}>
      <h2 style={{ fontSize: '1.125rem' }}>Your dashboard could not load</h2>
      <p style={{ margin: 0 }}>{message}</p>
      <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.875rem' }}>
        Nothing has been lost. Your listings and orders are safe on our side.
      </p>
      <div>
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    </section>
  );
}

export function EmptyBlock({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  return (
    <section style={CARD}>
      <h2 style={{ fontSize: '1.125rem' }}>{title}</h2>
      <p style={{ margin: 0, color: tokens.text.secondary }}>{body}</p>
      <div>{action}</div>
    </section>
  );
}

/** `navigator.onLine` is a hint, not proof, so the copy promises only what the app knows. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" style={{ ...CARD, borderColor: raw.color.signalCaution, padding: raw.space.s3, flexDirection: 'row', alignItems: 'center' }}>
      <strong>You are offline.</strong>
      <span style={{ color: tokens.text.secondary, fontSize: '0.875rem' }}>
        Showing what was loaded before the signal dropped. Actions will be refused until you reconnect.
      </span>
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ color: tokens.text.secondary, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontFamily: raw.type.familyText }}>{children}</span>
    </div>
  );
}
