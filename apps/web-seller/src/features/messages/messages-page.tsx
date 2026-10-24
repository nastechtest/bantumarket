import { useMemo, useState } from 'react';
import { MoneyText } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import { PageHeader } from '../../layout/page-header.js';
import { sastDate, sastTime } from '../../lib/dates.js';
import { countOf } from '../../lib/format.js';
import { Chip, EmptyNote, Note, Panel } from '../../ui/primitives.js';
import { THREADS, lastMessage, totalUnread } from './api/thread-fixtures.js';

export function MessagesPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const rows = useMemo(() => (unreadOnly ? THREADS.filter((thread) => thread.unread > 0) : THREADS), [unreadOnly]);
  const unread = totalUnread(THREADS);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title="Messages"
        eyebrow="Buyers"
        description="Questions about a listing, handover arrangements and support notes in one place. Phone numbers are never shown here — keep the conversation in NasTech so support can read it if something goes wrong."
      />

      <Panel title="Inbox" description={`${countOf(THREADS.length, 'conversation')}, ${unread} unread.`} id="message-inbox">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" className={unreadOnly ? '' : 'secondary'} aria-pressed={unreadOnly} onClick={() => setUnreadOnly((current) => !current)}>
            {unreadOnly ? 'Showing unread only' : `Show unread only (${unread})`}
          </button>
        </div>

        {rows.length === 0 ? (
          <EmptyNote
            title="Nothing unread"
            body="Every buyer question has been answered. New messages appear here and on your dashboard."
            action={
              <button type="button" className="secondary" onClick={() => setUnreadOnly(false)}>
                Show all conversations
              </button>
            }
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {rows.map((thread) => {
              const message = lastMessage(thread);
              return (
                <li key={thread.id}>
                  <a
                    href={`/messages/${thread.id}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: '12px',
                      alignItems: 'start',
                      padding: raw.space.s3,
                      border: `1px solid ${thread.unread > 0 ? raw.color.accent300 : raw.color.ink100}`,
                      borderRadius: raw.radius.md,
                      color: tokens.text.primary,
                      textDecoration: 'none',
                      background: tokens.surface.primary,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong>{thread.buyerHandle}</strong>
                        {thread.unread > 0 ? <Chip tone="progress">{thread.unread} unread</Chip> : null}
                      </div>
                      <span style={{ color: tokens.text.secondary, fontSize: '0.84rem' }}>
                        {thread.listingTitle} · <MoneyText value={thread.listingPrice} />
                      </span>
                      <span style={{ fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {message === null ? 'No messages yet.' : message.body}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right', color: tokens.text.secondary, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'block' }}>{message === null ? '' : sastTime(message.at)}</span>
                      <span style={{ display: 'block' }}>{message === null ? '' : sastDate(message.at)}</span>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Note title="What buyers can see">
        Buyers see your public handle, the listing and the conversation. They do not see your email, your bank details or a phone
        number. Meet in a public place for a handover, and confirm with the PIN when you are both there.
      </Note>
    </div>
  );
}
