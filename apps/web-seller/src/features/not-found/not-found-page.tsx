import { PageHeader } from '../../layout/page-header.js';
import { raw, tokens } from '@nastech/design-tokens';
import { EmptyNote, Note } from '../../ui/primitives.js';

const DESTINATIONS = [
  { href: '/', label: 'Today', detail: 'What needs you, listings and money at a glance.' },
  { href: '/listings', label: 'My listings', detail: 'Drafts, live listings and reviews.' },
  { href: '/orders', label: 'Sales', detail: 'Paid orders, handovers and disputes.' },
  { href: '/messages', label: 'Messages', detail: 'Buyer questions and handover arrangements.' },
  { href: '/payouts', label: 'Payouts', detail: 'What is payable and where it is sent.' },
] as const;

export function NotFoundPage({ path }: { readonly path: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title="That page is not here"
        eyebrow="Not found"
        description="The address may be out of date, or the listing or order may belong to another seller."
      />

      <EmptyNote
        title="Check the address, or start from one of these screens"
        body="Nothing has changed in your account. This is only a missing page."
        action={<a className="button" href="/">Go to Today</a>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
        {DESTINATIONS.map((destination) => (
          <a
            key={destination.href}
            href={destination.href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              padding: raw.space.s3,
              border: `1px solid ${raw.color.ink100}`,
              borderRadius: raw.radius.md,
              background: tokens.surface.primary,
              color: tokens.text.primary,
              textDecoration: 'none',
            }}
          >
            <strong>{destination.label}</strong>
            <span style={{ color: tokens.text.secondary, fontSize: '0.84rem' }}>{destination.detail}</span>
          </a>
        ))}
      </div>

      <Note title="If a link brought you here">
        Copy the address and send it to support from the help link in the footer. Do not send a bank account number or a
        sign-in code.
      </Note>

      <p style={{ margin: 0, color: tokens.text.secondary, fontSize: '0.8rem' }}>
        Requested path: <code style={{ fontFamily: raw.type.familyMono }}>{path}</code>
      </p>
    </div>
  );
}
