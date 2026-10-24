import { describe, expect, it } from 'bun:test';
import { win } from './dom-setup.js';
import { ConversationPage } from '../features/messages/conversation-page.js';
import { MessagesPage } from '../features/messages/messages-page.js';
import { click, mount, textOf } from './mount.js';

const PHONE_SHAPE = /(?:\+27|0)\d{2}[\s-]?\d{3}[\s-]?\d{4}/;

function buttonByText(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((candidate) =>
    (candidate.textContent ?? '').includes(label),
  );
  if (button === undefined) throw new Error(`no button containing "${label}"`);
  return button as HTMLButtonElement;
}

function conversationList(container: HTMLElement): HTMLElement {
  const list = container.querySelector('ul[aria-label^="Conversation with"]');
  if (!(list instanceof win.HTMLUListElement)) throw new Error('conversation list missing');
  return list;
}

describe('messages inbox', () => {
  it('shows buyer handles and listing context, and never a buyer phone number', async () => {
    const mounted = mount(<MessagesPage />);
    const body = textOf(mounted.container);
    expect(body).toContain('Messages');
    expect(body).toContain('@nomsa.m');
    expect(body).toContain('Tissot PRX Powermatic 80');
    expect(body).toContain('2 unread');
    expect(body).not.toMatch(PHONE_SHAPE);
    expect(body).not.toContain('+27');
    mounted.unmount();
  });

  it('filters to unread threads without hiding the one that needs an answer', async () => {
    const mounted = mount(<MessagesPage />);
    await click(buttonByText(mounted.container, 'Show unread only'));
    const body = textOf(mounted.container);
    expect(body).toContain('@nomsa.m');
    expect(body).not.toContain('@lerato.j');
    mounted.unmount();
  });
});

describe('conversation', () => {
  it('shows the thread with no phone number in it', async () => {
    const mounted = mount(<ConversationPage threadId="thr_2001" />);
    const body = textOf(mounted.container);
    expect(body).toContain('@nomsa.m');
    expect(body).toContain('is the original box included');
    expect(body).toContain('Messages only');
    expect(body).not.toMatch(PHONE_SHAPE);
    mounted.unmount();
  });

  it('sends a real reply and keeps it in the thread', async () => {
    const mounted = mount(<ConversationPage threadId="thr_2001" />);
    const send = buttonByText(mounted.container, 'Send reply');
    expect(send.disabled).toBe(true);

    await click(buttonByText(mounted.container, 'Saturday morning works for me.'));
    expect(buttonByText(mounted.container, 'Send reply').disabled).toBe(false);
    expect(textOf(conversationList(mounted.container))).not.toContain('Saturday morning works for me.');

    await click(buttonByText(mounted.container, 'Send reply'));

    expect(textOf(conversationList(mounted.container))).toContain('Saturday morning works for me.');
    expect(textOf(mounted.container)).toContain('Your reply is in the thread');
    mounted.unmount();
  });

  it('offers recovery when a thread id is not in the inbox', async () => {
    const mounted = mount(<ConversationPage threadId="thr_missing" />);
    expect(textOf(mounted.container)).toContain('Conversation not found');
    expect(textOf(mounted.container)).toContain('Back to messages');
    mounted.unmount();
  });
});
