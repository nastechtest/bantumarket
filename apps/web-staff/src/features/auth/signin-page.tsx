import { useEffect, useState } from 'react';
import { raw } from '@nastech/design-tokens';
import { navigate } from '../../router.js';
import { getOnline, subscribeOnline } from '../../shell/connectivity.js';
import { setStaffSession } from '../../shell/session-store.js';
import { useStaffSession } from '../../shell/use-staff-session.js';
import type { StaffSession } from '../../shell/session.js';
import { ActionButton, Field, Notice, OfflinePanel, PageHeader, Panel, SignInRequiredPanel } from '../../shell/ui.js';
import { deviceNotice, devicePosture, requiresAcknowledgement } from './device-recognised.js';
import { MfaStep } from './mfa-step.js';
import type { SignInResult, StaffAuthTransport } from './api/staff-auth-transport.js';
import { createAuthFixture } from './api/fixtures.js';

const DEFAULT_TRANSPORT = createAuthFixture();

export interface SignInPageProps {
  readonly transport?: StaffAuthTransport;
  readonly deviceId?: string;
  readonly now?: string;
  readonly onSignedIn?: (session: StaffSession) => void;
}

type Stage =
  | { readonly name: 'credentials' }
  | { readonly name: 'mfa'; readonly challengeId: string }
  | { readonly name: 'refused'; readonly reason: string }
  | { readonly name: 'identity'; readonly session: StaffSession };

/**
 * Staff sign-in. Three refusals live here and none is a soft warning:
 *  - a response that claims `signed_in` without `mfaSatisfied` is discarded;
 *  - a recognised browser still needs the code;
 *  - the failure copy never confirms whether a staff account exists.
 */
export function SignInPage({ transport = DEFAULT_TRANSPORT, deviceId = 'dev_console_01', now = new Date().toISOString(), onSignedIn }: SignInPageProps) {
  const stored = useStaffSession();
  const [stage, setStage] = useState<Stage>(() =>
    stored === null ? { name: 'credentials' } : { name: 'identity', session: stored },
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recognised, setRecognised] = useState<boolean | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [online, setOnline] = useState(getOnline());

  useEffect(() => subscribeOnline(() => setOnline(getOnline())), []);
  useEffect(() => {
    let alive = true;
    void transport
      .recogniseDevice(deviceId)
      .then((value) => {
        if (alive) setRecognised(value);
      })
      .catch(() => {
        if (alive) setRecognised(false);
      });
    return () => {
      alive = false;
    };
  }, [transport, deviceId]);

  const posture = devicePosture({
    deviceId,
    firstSeenAt: now,
    recognised: recognised === null ? false : recognised,
  });
  const notice = deviceNotice(posture, now, {
    deviceId,
    firstSeenAt: now,
    recognised: recognised === true,
  });

  function accept(result: SignInResult): void {
    if (result.stage === 'refused') {
      setStage({ name: 'refused', reason: result.refusal ?? 'Sign-in was refused.' });
      return;
    }
    if (result.stage === 'mfa_required' && result.challengeId) {
      setStage({ name: 'mfa', challengeId: result.challengeId });
      return;
    }
    if (result.stage === 'signed_in') {
      if (!result.session || !result.session.mfaSatisfied) {
        setStage({
          name: 'refused',
          reason: 'The server returned a staff session without a completed second factor. This console refuses that session.',
        });
        return;
      }
      setStaffSession(result.session);
      onSignedIn?.(result.session);
      setStage({ name: 'identity', session: result.session });
    }
  }

  if (!online) {
    return (
      <div>
        <PageHeader title="Staff sign in" kicker="NasTech Market operations" />
        <OfflinePanel />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '34rem' }}>
      <PageHeader title="Staff sign in" kicker="NasTech Market operations">
        <p style={{ margin: 0, fontSize: '0.875rem', color: raw.color.ink500 }}>
          The console is an audited instrument. Every action is attributed to the person who took it.
        </p>
      </PageHeader>

      {stage.name === 'identity' ? (
        <Panel title="Signed in">
          <p style={{ margin: 0 }}>
            {stage.session.displayName} ({stage.session.operatorId}) · {stage.session.role}
          </p>
          <p style={{ margin: 0, fontSize: '0.8125rem' }}>{stage.session.capabilities.join(', ')}</p>
          <ActionButton label="Open the review queue" onClick={() => navigate('/')} />
        </Panel>
      ) : null}

      {stage.name === 'credentials' ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s3 }}>
          <Notice tone="info" title="Device history">{notice}</Notice>
          <Field id="staff-email" label="Staff email" value={email} onChange={setEmail} type="email" autoComplete="username" required />
          <Field id="staff-password" label="Password" value={password} onChange={setPassword} type="password" autoComplete="current-password" required />
          {requiresAcknowledgement(posture) ? (
            <label style={{ display: 'flex', gap: raw.space.s2, alignItems: 'flex-start', fontSize: '0.875rem' }}>
              <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
              I understand this browser has not signed in before. The second factor is still required.
            </label>
          ) : null}
          {error ? <Notice tone="negative" title="Sign-in did not complete">{error}</Notice> : null}
          <ActionButton
            label="Continue"
            busy={busy}
            disabled={!email.trim() || !password || (requiresAcknowledgement(posture) && !acknowledged)}
            disabledReason={!email.trim() || !password ? 'Enter both your staff email and password.' : 'Acknowledge the new browser first.'}
            onClick={() => {
              setBusy(true);
              setError(null);
              void transport
                .beginSignIn({ email: email.trim(), password, deviceId })
                .then(accept)
                .catch(() => setError('Sign-in could not be completed. Try again.'))
                .finally(() => setBusy(false));
            }}
          />
        </section>
      ) : null}

      {stage.name === 'mfa' ? (
        <MfaStep
          challengeId={stage.challengeId}
          busy={busy}
          error={error}
          onSubmit={(code) => {
            setBusy(true);
            setError(null);
            return transport
              .verifyMfa({ challengeId: stage.challengeId, code })
              .then(accept)
              .catch(() => setError('The code could not be checked. Try again.'))
              .finally(() => setBusy(false));
          }}
        />
      ) : null}

      {stage.name === 'refused' ? (
        <>
          <Notice tone="negative" title="Sign-in was refused">{stage.reason}</Notice>
          <ActionButton label="Start again" tone="secondary" onClick={() => setStage({ name: 'credentials' })} />
        </>
      ) : null}

      {stored === null && stage.name !== 'credentials' && stage.name !== 'mfa' ? <SignInRequiredPanel /> : null}
    </div>
  );
}
