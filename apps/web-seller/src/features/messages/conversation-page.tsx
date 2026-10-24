import { useState } from 'react';
import { MoneyText } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';
import { PageHeader } from '../../layout/page-header.js';
import { sastDate, sastTime } from '../../lib/dates.js';
import { Chip, EmptyNote, KeyValue, Note, Panel } from '../../ui/primitives.js';
import { threadById, type Message, type Thread } from './api/thread-fixtures.js';

const QUICK_REPLIES = ['Yes, it is still available.', 'Saturday morning works for me.', 'The spare links are included.'] as const;

function bubbleStyle(sender: Message['sender']): React.CSSProperties {
  if (sender === 'system') {
    return {
      alignSelf: 'center',
      maxWidth: '85%',
      background: tokens.surface.raised,
      border: `1px solid ${raw.color.ink100}`,
      borderRadius: raw.radius.md,
      padding: raw.space.s2,
      fontSize: '0.82rem',
      color: tokens.text.secondary,
      textAlign: 'center',
    };
  }
  return {
    alignSelf: sender === 'seller' ? 'flex-end' : 'flex-start',
    maxWidth: '85%',
    background: sender === 'seller' ? raw.color.accent900 : tokens.surface.raised,
    color: sender === 'seller' ? tokens.text.onInverse : tokens.text.primary,
    borderRadius: raw.radius.lg,
    padding: raw.space.s3,
    fontSize: '0.9rem',
    lineHeight: 1.5,
  };
}

function ConversationView({ thread }: { readonly thread: Thread }) {
  const [messages, setMessages] = useState<readonly Message[]>(thread.messages);
  const [draft, setDraft] = useState('');
  const [sent, setSent] = useState(false);

  function send() {
    const body = draft.trim();
    if (body === '') return;
    const message: Message = {
      id: `msg_local_${messages.length + 1}`,
      sender: 'seller',
      body,
      at: new Date().toISOString(),
    };
    setMessages((current) => [...current, message]);
    setDraft('');
    setSent(true);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <PageHeader
        title={thread.buyerHandle}
        eyebrow={`${thread.listingTitle} · ${thread.listingId}`}
        description="Messages stay inside NasTech. Neither side sees the other’s phone number, and support can read the thread if a handover goes wrong."
      >
        <a className="button secondary" href={`/listings/${thread.listingId}`}>
          View listing
        </a>
        <a className="button secondary" href="/messages">
          Back to inbox
        </a>
      </PageHeader>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)', gap: '16px', alignItems: 'start' }}>
        <Panel title="Conversation" description={`${messages.length} messages about this watch.`} id="conversation">
          <ul aria-label={`Conversation with ${thread.buyerHandle}`} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.map((message) => (
              <li key={message.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={bubbleStyle(message.sender)}>
                  {message.sender === 'system' ? null : (
                    <span style={{ display: 'block', fontSize: '0.72rem', opacity: 0.8, marginBottom: 2 }}>
                      {message.sender === 'seller' ? 'You' : thread.buyerHandle}
                    </span>
                  )}
                  {message.body}
                  <span style={{ display: 'block', marginTop: 4, fontSize: '0.72rem', opacity: 0.75 }}>
                    {sastDate(message.at)}, {sastTime(message.at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: `1px solid ${raw.color.ink100}`, paddingTop: raw.space.s3 }}>
            <label htmlFor="reply" style={{ fontSize: '0.875rem', fontWeight: 600 }}>
              Reply to {thread.buyerHandle}
            </label>
            <textarea
              id="reply"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              placeholder="Write about the watch, the handover or a disclosed mark."
              style={{ padding: '8px 10px', border: `1px solid ${raw.color.ink300}`, borderRadius: raw.radius.sm, font: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" disabled={draft.trim() === ''} onClick={send}>
                Send reply
              </button>
              {QUICK_REPLIES.map((reply) => (
                <button key={reply} type="button" className="secondary" onClick={() => setDraft(reply)}>
                  {reply}
                </button>
              ))}
            </div>
            {sent ? <Note tone="success">Your reply is in the thread. The buyer sees it next time they open the conversation.</Note> : null}
          </div>
        </Panel>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Panel title="About this listing" id="conversation-listing">
            <KeyValue label="Watch">{thread.listingTitle}</KeyValue>
            <KeyValue label="Asking price">
              <MoneyText value={thread.listingPrice} />
            </KeyValue>
            <KeyValue label="Buyer">{thread.buyerHandle}</KeyValue>
            <KeyValue label="Contact">Messages only</KeyValue>
            <a href={`/listings/${thread.listingId}`}>Open the listing</a>
          </Panel>
          <Note title="Handover safety">
            Agree a public place and a time in this thread. Bring the watch, the box and anything you disclosed. Confirm the
            handover with the PIN only when you are both present.
          </Note>
          {thread.unread > 0 ? <Chip tone="progress">{thread.unread} unread when you opened this thread</Chip> : null}
        </div>
      </div>
    </div>
  );
}

export function ConversationPage({ threadId }: { readonly threadId: string | null }) {
  const thread = threadById(threadId);
  if (thread === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <PageHeader title="Conversation not found" eyebrow="Messages" description="That conversation id is not in your inbox." />
        <EmptyNote
          title="The thread may have been removed"
          body="Every conversation about your listings is listed in the inbox."
          action={<a className="button" href="/messages">Back to messages</a>}
        />
      </div>
    );
  }
  return <ConversationView thread={thread} />;
}
