import { useState } from 'react';
import { raw, tokens } from '@nastech/design-tokens';
import type { ReportEvidence } from '../api/safety-transport.js';

/**
 * Evidence ranked by what the queue can actually read. In-platform messages are first-class: we
 * hold them ourselves. Screenshots rank below — and this screen says so, because in this market a
 * fake payment screenshot is the crime, not the evidence.
 */

interface PlatformMessage {
  readonly id: string;
  readonly from: string;
  readonly at: string;
  readonly excerpt: string;
}

/** Stand-in for the reporter's conversation; a real transport would fetch it by subject id. */
export const fixtureMessages: readonly PlatformMessage[] = [
  { id: 'msg_881', from: '@thabo.watches', at: '19 Oct, 20:14', excerpt: 'Add me on WhatsApp, easier to sort there — 071…' },
  { id: 'msg_884', from: 'You', at: '19 Oct, 20:31', excerpt: 'Let’s keep it in the app until we meet.' },
  { id: 'msg_890', from: '@thabo.watches', at: '20 Oct, 08:02', excerpt: 'I already paid, sending you the proof now (image)' },
  { id: 'msg_891', from: '@thabo.watches', at: '20 Oct, 08:03', excerpt: 'Bank says R4,200 sent. Just refund me the R700 difference, my courier comes tomorrow.' },
];

export function EvidenceStep({
  value,
  onChange,
}: {
  readonly value: readonly ReportEvidence[];
  readonly onChange: (evidence: readonly ReportEvidence[]) => void;
}) {
  const [note, setNote] = useState('');
  const selectedIds = new Set(
    value.filter((e) => e.kind === 'in_platform_message').map((e) => e.ref),
  );

  const toggleMessage = (msg: PlatformMessage) => {
    if (selectedIds.has(msg.id)) {
      onChange(value.filter((e) => !(e.kind === 'in_platform_message' && e.ref === msg.id)));
    } else {
      onChange([
        ...value,
        {
          kind: 'in_platform_message',
          ref: msg.id,
          description: `“${msg.excerpt}” — ${msg.from}, ${msg.at}`,
        },
      ]);
    }
  };

  const addNote = () => {
    const text = note.trim();
    if (text.length === 0) return;
    onChange([...value, { kind: 'written_note', ref: `note_${Date.now()}`, description: text }]);
    setNote('');
  };

  return (
    <section
      className="safety-report-evidence"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary }}
    >
      <h3 style={{ marginTop: 0, fontSize: '1.1rem' }}>What can you show?</h3>
      <p style={{ marginTop: 0, fontSize: '0.9rem', color: tokens.text.secondary }}>
        Attach the messages you exchanged here — we can read them directly, and they carry more
        weight than any picture. Screenshots of “payment confirmations” are the least useful thing
        you can send, because a screenshot is exactly what a scammer forges. Never include your ID
        number, bank card numbers, or a handover code in anything you attach.
      </p>
      <fieldset style={{ border: `1px solid ${raw.color.ink100}`, borderRadius: raw.radius.md, padding: raw.space.s3 }}>
        <legend style={{ fontWeight: 600, fontSize: '0.9rem' }}>Messages from this conversation</legend>
        {fixtureMessages.map((msg) => (
          <label key={msg.id} style={{ display: 'block', marginBlock: raw.space.s2, cursor: 'pointer' }}>
            <span style={{ display: 'flex', gap: raw.space.s2, alignItems: 'baseline' }}>
              <input
                type="checkbox"
                checked={selectedIds.has(msg.id)}
                onChange={() => toggleMessage(msg)}
                data-testid={`evidence-${msg.id}`}
              />
              <span style={{ fontSize: '0.9rem' }}>
                <strong>{msg.from}</strong> · {msg.at} · “{msg.excerpt}”
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div style={{ marginTop: raw.space.s4 }}>
        <label htmlFor="evidence-note" style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem' }}>
          Or describe something you cannot attach
        </label>
        <div style={{ display: 'flex', gap: raw.space.s2, marginTop: raw.space.s2 }}>
          <input
            id="evidence-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. the courier label shows a Tracking ID that returns ‘not found’ on the courier’s site"
            style={{
              flex: 1,
              fontFamily: raw.type.familyText,
              padding: raw.space.s2,
              border: `1px solid ${raw.color.ink100}`,
              borderRadius: raw.radius.md,
            }}
          />
          <button type="button" onClick={addNote} style={{ padding: `${raw.space.s2} ${raw.space.s4}` }}>
            Add
          </button>
        </div>
      </div>
      {value.length > 0 ? (
        <ul style={{ marginTop: raw.space.s4, fontSize: '0.85rem', color: tokens.text.secondary }}>
          {value.map((e) => (
            <li key={`${e.kind}:${e.ref}`}>
              {e.kind === 'in_platform_message'
                ? `Platform message ${e.ref}: ${e.description}`
                : `Your note: ${e.description}`}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ marginTop: raw.space.s4, fontSize: '0.85rem', color: tokens.text.disabled }}>
          Nothing attached yet. Reports with no evidence still go to a human — they just usually end
          in “no action, not enough to work with”.
        </p>
      )}
    </section>
  );
}
