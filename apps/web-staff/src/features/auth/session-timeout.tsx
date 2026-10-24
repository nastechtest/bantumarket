import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { raw } from '@nastech/design-tokens';
import { formatDuration } from '../../shell/time.js';
import { SessionEndedPanel } from '../../shell/ui.js';

export const SESSION_WARNING_MS = 2 * 60 * 1000;

export interface SessionStatus {
  readonly remainingMs: number;
  readonly expired: boolean;
  readonly warning: boolean;
}

export function sessionStatus(expiresAt: string, nowIso: string, warningMs: number = SESSION_WARNING_MS): SessionStatus {
  const remainingMs = Math.max(0, Date.parse(expiresAt) - Date.parse(nowIso));
  return {
    remainingMs,
    expired: remainingMs === 0,
    warning: remainingMs > 0 && remainingMs <= warningMs,
  };
}

export interface SessionTimeoutWatcherProps {
  readonly expiresAt: string;
  readonly clock: () => string;
  readonly onExpire: () => void;
  readonly impersonating?: boolean;
  readonly intervalMs?: number;
  readonly warningMs?: number;
  readonly children: ReactNode;
}

/**
 * Counts against the session's server-issued expiry, not a local timer the client could pause.
 * The banner is a warning; expiry is a hard stop that renders no children at all and calls
 * `onExpire` once, which is what ends an impersonation session too.
 */
export function SessionTimeoutWatcher({
  expiresAt,
  clock,
  onExpire,
  impersonating = false,
  intervalMs = 15_000,
  warningMs = SESSION_WARNING_MS,
  children,
}: SessionTimeoutWatcherProps) {
  const [now, setNow] = useState(clock);
  const expiredRef = useRef(false);
  const status = sessionStatus(expiresAt, now, warningMs);

  useEffect(() => {
    const timer = setInterval(() => setNow(clock()), intervalMs);
    return () => clearInterval(timer);
  }, [clock, intervalMs]);

  useEffect(() => {
    if (!status.expired || expiredRef.current) return;
    expiredRef.current = true;
    onExpire();
  }, [status.expired, onExpire]);

  if (status.expired) return <SessionEndedPanel impersonating={impersonating} />;

  return (
    <>
      {status.warning ? (
        <div
          role="status"
          data-state="session-warning"
          style={{ background: raw.color.paperWarm, borderLeft: `3px solid ${raw.color.signalCaution}`, padding: raw.space.s2, fontSize: '0.875rem', marginBottom: raw.space.s3 }}
        >
          This session ends in {formatDuration(status.remainingMs)}. Finish or hand over before then; unsaved work will be lost.
        </div>
      ) : null}
      {children}
    </>
  );
}
