/**
 * isiXhosa catalogue — partial by design, gaps named.
 *
 * Same discipline as `zu.ts`: only the isiXhosa strings I can defend as real translations ship in
 * `messages` (these overlap isiZulu because the two are closely-related Nguni languages — Ikhaya,
 * Indawo, Thenga are shared — but Ixabiso and Enkosi/Hayi/Ewe are Xhosa forms, not Zulu's). The
 * verb phrases and every plural message depend on Xhosa noun-class concord and are held in
 * `untranslated` with the reason, so the completeness report shows a real gap rather than a guess.
 */

import type { LocaleMessages } from './types.js';

export const xh: LocaleMessages = {
  locale: 'xh',
  messages: {
    'nav.home': 'Ikhaya',
    'common.thankYou': 'Enkosi',
    'common.yes': 'Ewe',
    'common.no': 'Hayi',
    'listing.price': 'Ixabiso',
    'listing.location': 'Indawo',
    'listing.buy': 'Thenga',
  },
  untranslated: [
    { key: 'nav.search', reason: 'Verb form (Sesha vs Funa) needs a native review before shipping.' },
    { key: 'nav.categories', reason: 'Loanword for “categories” unconfirmed.' },
    { key: 'nav.messages', reason: 'Noun class for “messages” unconfirmed.' },
    { key: 'nav.profile', reason: 'No established isiXhosa term for a marketplace “profile”.' },
    { key: 'nav.signIn', reason: '“Ngenela” / sign-in idiom must be confirmed by a reviewer.' },
    { key: 'nav.signOut', reason: 'Paired with signIn; held until signIn is confirmed.' },
    { key: 'common.loading', reason: 'Progressive “loading” verb unconfirmed.' },
    { key: 'common.cancel', reason: 'Action verb “cancel” unconfirmed.' },
    { key: 'common.save', reason: 'Action verb “save” unconfirmed.' },
    { key: 'common.back', reason: 'Navigational “back” term unconfirmed.' },
    { key: 'common.next', reason: 'Navigational “next” term unconfirmed.' },
    { key: 'listing.condition', reason: '“Imeko” plausible for condition; awaiting review.' },
    { key: 'listing.contactSeller', reason: 'Requires verb + object concord; not assembled from parts.' },
    { key: 'listing.offer', reason: 'No confirmed term for a purchase “offer”.' },
    { key: 'listing.views', reason: 'Plural concord depends on noun class; withheld, see header.' },
    { key: 'search.placeholder', reason: '“pre-owned watches” noun phrase unconfirmed.' },
    { key: 'search.noResults', reason: 'Existential negation form unconfirmed.' },
    { key: 'search.results', reason: 'Plural concord depends on noun class; withheld, see header.' },
    { key: 'account.soldCount', reason: 'Subject concord + noun class agreement for “you sold” unconfirmed.' },
  ],
};
