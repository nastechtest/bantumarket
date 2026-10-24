import './test-dom.js';
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionButton, CursorNav, PermissionPanel } from './ui.js';
import { RequireCapability, RouteGate } from './require-capability.js';
import { fixtureSession } from './api/fixtures.js';
import { mutationControl } from './audited-action.js';

const now = '2026-10-22T09:05:00.000Z';

describe('RequireCapability', () => {
  it('does not render the child when the capability is absent', () => {
    const session = fixtureSession({ capabilities: ['queue.view'] });
    const markup = renderToStaticMarkup(
      <RequireCapability session={session} capability="listing.takedown" now={now}>
        <p>Take down this listing</p>
      </RequireCapability>,
    );
    expect(markup).not.toContain('Take down this listing');
    expect(markup).toContain('Your role does not include this');
    expect(markup).toContain('listing.takedown');
  });

  it('renders the action disabled with a visible reason when the transport has not granted it', () => {
    const session = fixtureSession({ capabilities: ['queue.view'] });
    const control = mutationControl(session, 'listing.takedown', now, { forceVisible: true, reason: 'Prohibited item' });
    const markup = renderToStaticMarkup(
      <div>
        <ActionButton label="Take down" onClick={() => undefined} disabled={control.disabled} disabledReason={control.reason ?? undefined} tone="danger" />
      </div>,
    );
    expect(markup).toContain('disabled');
    expect(markup).toContain('Your role does not include this.');
  });

  it('renders the child only when the server granted the capability', () => {
    const session = fixtureSession({ capabilities: ['listing.takedown'] });
    const markup = renderToStaticMarkup(
      <RequireCapability session={session} capability="listing.takedown" now={now}>
        <p>Take down this listing</p>
      </RequireCapability>,
    );
    expect(markup).toContain('Take down this listing');
  });

  it('refuses a session without a second factor', () => {
    const session = fixtureSession({ mfaSatisfied: false });
    const markup = renderToStaticMarkup(
      <RequireCapability session={session} capability="listing.review" now={now}>
        <p>Approve</p>
      </RequireCapability>,
    );
    expect(markup).not.toContain('Approve</p>');
    expect(markup).toContain('second factor');
  });

  it('refuses an expired session before rendering any capability decision', () => {
    const session = fixtureSession({ expiresAt: '2026-10-22T09:00:00.000Z' });
    const markup = renderToStaticMarkup(
      <RequireCapability session={session} capability="listing.review" now={now}>
        <p>Approve</p>
      </RequireCapability>,
    );
    expect(markup).toContain('Session ended');
    expect(markup).not.toContain('Your role does not include');
  });
});

describe('RouteGate', () => {
  it('refuses payouts during impersonation even when the capability is present', () => {
    const session = fixtureSession({
      role: 'admin',
      impersonation: {
        operatorId: 'staff_thandi',
        targetId: 'user_42',
        targetLabel: 'Sipho Ndlovu',
        reason: 'Support call',
        startedAt: '2026-10-22T08:55:00.000Z',
        expiresAt: '2026-10-22T09:20:00.000Z',
        stamp: { actor: 'staff_thandi', role: 'admin', target: 'user_42', reason: 'Support call', at: '2026-10-22T08:55:00.000Z' },
      },
    });
    const markup = renderToStaticMarkup(
      <RouteGate session={session} pathname="/payouts" now={now}>
        <p>Release batch</p>
      </RouteGate>,
    );
    expect(markup).not.toContain('Release batch');
    expect(markup).toContain('Your role does not include this');
  });
});

describe('permission refusal copy', () => {
  it('names the capability and the role, never a record or its existence', () => {
    const markup = renderToStaticMarkup(<PermissionPanel capability="dispute.decide" />);
    expect(markup).toContain('dispute.decide');
    expect(markup).toContain('Dispute resolver');
    expect(markup.toLowerCase()).not.toContain('not found');
    expect(markup.toLowerCase()).not.toContain('does not exist');
  });

  it('gives a visible reason for a disabled paging control', () => {
    const markup = renderToStaticMarkup(
      <CursorNav nextCursor={null} canPrevious={false} onNext={() => undefined} onPrevious={() => undefined} />,
    );
    expect(markup).toContain('No more rows in this range.');
    expect(markup).toContain('You are on the first page of this range.');
  });
});
