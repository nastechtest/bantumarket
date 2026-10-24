import { money } from '@nastech/api-contracts';
import type { Money } from '@nastech/api-contracts';

/**
 * Buyer conversations. There is deliberately no phone field on a thread or a buyer: the seller
 * app never receives one, so a screen cannot leak what it does not hold. Handles are the public
 * identity both sides see.
 */

export interface Message {
  readonly id: string;
  readonly sender: 'buyer' | 'seller' | 'system';
  readonly body: string;
  readonly at: string;
}

export interface Thread {
  readonly id: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly listingPrice: Money;
  readonly buyerHandle: string;
  readonly unread: number;
  readonly messages: readonly Message[];
}

export const THREADS: readonly Thread[] = [
  {
    id: 'thr_2001',
    listingId: 'lst_0981',
    listingTitle: 'Tissot PRX Powermatic 80',
    listingPrice: money(420_000),
    buyerHandle: '@nomsa.m',
    unread: 2,
    messages: [
      { id: 'msg_01', sender: 'buyer', body: 'Hi Pieter, is the original box included? The listing says yes but I wanted to check the condition of it.', at: '2026-10-15T08:40:00+02:00' },
      { id: 'msg_02', sender: 'seller', body: 'Morning Nomsa. Yes — the box is here, inner and outer. One corner is a little scuffed, I can send a photo.', at: '2026-10-15T08:52:00+02:00' },
      { id: 'msg_03', sender: 'buyer', body: 'A photo would help, thank you. Could we meet on Saturday morning if the watch is still available?', at: '2026-10-15T09:02:00+02:00' },
      { id: 'msg_04', sender: 'buyer', body: 'I am in Observatory, so anywhere in the city bowl works for me.', at: '2026-10-15T09:03:00+02:00' },
    ],
  },
  {
    id: 'thr_2002',
    listingId: 'lst_1002',
    listingTitle: 'Tudor Black Bay 58, navy bezel',
    listingPrice: money(4_250_000),
    buyerHandle: '@lerato.j',
    unread: 0,
    messages: [
      { id: 'msg_11', sender: 'buyer', body: 'The blue bezel is exactly what I have been looking for. Is the bracelet full length?', at: '2026-10-13T17:20:00+02:00' },
      { id: 'msg_12', sender: 'seller', body: 'Full length, plus two spare links. The clasp has light desk marks, shown in the fourth photo.', at: '2026-10-13T17:31:00+02:00' },
      { id: 'msg_13', sender: 'system', body: 'Handover scheduled for 17 Oct at 11:00 at the V&A Waterfront information desk.', at: '2026-10-14T08:06:00+02:00' },
      { id: 'msg_14', sender: 'buyer', body: 'Perfect. I will bring the handover PIN and check the bracelet in person.', at: '2026-10-14T08:12:00+02:00' },
    ],
  },
  {
    id: 'thr_2003',
    listingId: 'lst_0971',
    listingTitle: 'Hamilton Khaki Field Mechanical',
    listingPrice: money(389_000),
    buyerHandle: '@thabo.k',
    unread: 0,
    messages: [
      { id: 'msg_21', sender: 'buyer', body: 'Picked it up on Thursday — thank you. It is keeping good time.', at: '2026-10-09T18:05:00+02:00' },
      { id: 'msg_22', sender: 'seller', body: 'Glad to hear it, Thabo. Enjoy it.', at: '2026-10-09T18:20:00+02:00' },
    ],
  },
];

export function threadById(id: string | null): Thread | null {
  if (id === null) return null;
  return THREADS.find((thread) => thread.id === id) ?? null;
}

export function lastMessage(thread: Thread): Message | null {
  return thread.messages[thread.messages.length - 1] ?? null;
}

export function totalUnread(threads: readonly Thread[]): number {
  return threads.reduce((sum, thread) => sum + thread.unread, 0);
}
