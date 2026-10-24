import { useState } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { raw, tokens } from '@nastech/design-tokens';
import { Modal } from '../overlay/modal.js';

export interface ConfirmDestructiveProps {
  title: string;
  /**
   * What is about to be lost, each as one factual sentence. The user must affirm every entry —
   * the point of the pattern is that the consequence is *read and stated back*, not that a
   * word is typed for show.
   */
  consequences: readonly string[];
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

/**
 * The only destructive-affordance pattern in the product: cancel/delete/escalate all route
 * here, so "irreversible" means the same thing and looks the same everywhere.
 *
 * The confirm control stays disabled until every consequence has been affirmed — the gate is
 * plain state, so the keyboard path and the pointer path hit the same wall. Escape and the scrim
 * are the cancel path, never a third outcome: there is exactly one way this dialog says "yes".
 */
export function ConfirmDestructive({
  title,
  consequences,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  children,
}: ConfirmDestructiveProps) {
  const [affirmed, setAffirmed] = useState<ReadonlySet<number>>(new Set());
  const allAffirmed = affirmed.size === consequences.length;

  const toggle = (index: number, next: boolean) => {
    setAffirmed((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(index);
      else copy.delete(index);
      return copy;
    });
  };

  return (
    <Modal open onClose={onCancel} title={title} role="alertdialog">
      <div
        className="ds-confirm-consequences"
        style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s3, fontFamily: raw.type.familyText }}
      >
        {consequences.map((line, index) => {
          const boxId = `ds-confirm-consequence-${index}`;
          return (
            <div key={line} style={{ display: 'flex', gap: raw.space.s2, alignItems: 'flex-start' }}>
              <input
                id={boxId}
                type="checkbox"
                checked={affirmed.has(index)}
                onChange={(event) => toggle(index, event.target.checked)}
                style={{ marginTop: raw.space.s1, accentColor: tokens.action.default }}
              />
              <label htmlFor={boxId} style={{ fontSize: '0.875rem', color: tokens.text.primary }}>
                {line}
              </label>
            </div>
          );
        })}
      </div>
      {children ? <div style={{ marginTop: raw.space.s3 }}>{children}</div> : null}
      <div style={{ display: 'flex', gap: raw.space.s3, marginTop: raw.space.s5, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'none',
            border: `1px solid ${raw.color.ink300}`,
            borderRadius: raw.radius.sm,
            color: tokens.text.primary,
            padding: `${raw.space.s2} ${raw.space.s4}`,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          data-confirm-destructive=""
          disabled={!allAffirmed}
          onClick={onConfirm}
          style={{
            background: raw.color.signalNegative,
            color: tokens.text.onInverse,
            border: 'none',
            borderRadius: raw.radius.sm,
            padding: `${raw.space.s2} ${raw.space.s4}`,
            fontSize: '0.875rem',
            cursor: allAffirmed ? 'pointer' : 'default',
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export type ConfirmDestructiveRequest = Omit<ConfirmDestructiveProps, 'onConfirm' | 'onCancel' | 'children'>;

/**
 * The promise form, for call sites that read better inline:
 * `if (await confirmDestructive({...})) await cancelOrder(id)`.
 *
 * It resolves **only on confirm** — the sentence the caller waits for is the sentence the user
 * affirmed. Cancel and Escape tear the dialog down and leave the promise pending forever; that
 * is deliberate (a rejected promise on ordinary dismissal produces unhandled-rejection noise in
 * the money routes, and a `false` resolution invites `if (!ok) doTheThing()` inversions). The
 * pending promise is collected with the call site's closure; nothing keeps it alive.
 *
 * Client-only by construction: it mounts a detached root on `document.body`.
 */
export function confirmDestructive(request: ConfirmDestructiveRequest): Promise<true> {
  if (typeof document === 'undefined') return Promise.reject(new Error('confirmDestructive is client-only'));
  const container = document.createElement('div');
  container.setAttribute('data-ds-confirm-destructive-host', '');
  document.body.appendChild(container);
  let root: Root | null = createRoot(container);

  const teardown = () => {
    const activeRoot = root;
    root = null;
    if (!activeRoot) return;
    // Unmount is deferred a tick so it never runs inside the render phase that raised the event.
    setTimeout(() => {
      activeRoot.unmount();
      if (container.parentElement === document.body) document.body.removeChild(container);
    }, 0);
  };

  return new Promise<true>((resolve) => {
    const tree = (
      <ConfirmDestructive
        {...request}
        onConfirm={() => {
          teardown();
          resolve(true);
        }}
        onCancel={teardown}
      />
    );
    root?.render(tree);
  });
}

/** Test seam: the host attribute above is what dismiss-completion tests look for. */
export function isConfirmDestructiveMounted(): boolean {
  return typeof document !== 'undefined' && document.querySelector('[data-ds-confirm-destructive-host]') !== null;
}
