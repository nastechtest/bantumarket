/**
 * isiZulu catalogue — partial by design, and the gaps are named.
 *
 * I have translated only the isiZulu strings I can defend as a real rendering, not English with
 * diacritics: the home label, the two affirmatives/negatives, and three single-word marketplace
 * nouns. Everything else is listed in `untranslated` with the reason it is a gap rather than a
 * guess, and the completeness test turns that list into a visible report. In particular the plural
 * messages are withheld: isiZulu noun-class agreement decides the concord for "views"/"results", and
 * getting it wrong is worse than shipping the gap.
 */

import type { LocaleMessages } from './types.js';

export const zu: LocaleMessages = {
  locale: 'zu',
  messages: {
    'nav.home': 'Ikhaya',
    'common.thankYou': 'Ngiyabonga',
    'common.yes': 'Yebo',
    'common.no': 'Cha',
    'listing.price': 'Intengo',
    'listing.location': 'Indawo',
    'listing.buy': 'Thenga',
  },
  untranslated: [
    { key: 'nav.search', reason: 'Verb form (Sesha vs Funa) needs a native review before shipping.' },
    { key: 'nav.categories', reason: 'Loanword for “categories” unconfirmed; not guessed.' },
    { key: 'nav.messages', reason: 'Noun class for “messages” unconfirmed.' },
    { key: 'nav.profile', reason: 'No established isiZulu term for a marketplace “profile”.' },
    { key: 'nav.signIn', reason: '“Ngena ngemvume” is plausible but must be confirmed by a reviewer.' },
    { key: 'nav.signOut', reason: 'Paired with signIn; held until signIn is confirmed.' },
    { key: 'common.loading', reason: 'Progressive “loading” verb unconfirmed.' },
    { key: 'common.cancel', reason: 'Action verb “cancel” unconfirmed.' },
    { key: 'common.save', reason: 'Action verb “save” unconfirmed.' },
    { key: 'common.back', reason: 'Navigational “back” term unconfirmed.' },
    { key: 'common.next', reason: 'Navigational “next” term unconfirmed.' },
    { key: 'listing.condition', reason: '“Isimo” plausible for condition; awaiting review.' },
    { key: 'listing.contactSeller', reason: 'Phrase requires a verb + object concord; not assembled from parts.' },
    { key: 'listing.offer', reason: 'No confirmed term for a purchase “offer”.' },
    { key: 'listing.views', reason: 'Plural concord depends on noun class; withheld, see header.' },
    { key: 'search.placeholder', reason: '“pre-owned watches” noun phrase unconfirmed.' },
    { key: 'search.noResults', reason: 'Existential negation form unconfirmed.' },
    { key: 'search.results', reason: 'Plural concord depends on noun class; withheld, see header.' },
    { key: 'account.soldCount', reason: 'Subject concord + noun class agreement for “you sold” unconfirmed.' },
  ],
};
