/**
 * English is the authoring language of the listing — this file defines the key space every other
 * catalogue is measured against. Values are ICU message patterns (see `icu.ts`): plain interpolation
 * `{name}`, and `plural` / `select` for the strings that must agree with a number or a choice.
 *
 * Keys are dot-namespaced, flat. A flat space makes the completeness test a set comparison rather
 * than a deep walk, and stops a locale "translating" a whole branch by adding one leaf under it.
 *
 * Do not add a key here casually: it instantly becomes a required translation for three other
 * languages, or an explicit, reasoned gap in their `untranslated` allowlist.
 */

import type { LocaleMessages } from './types.js';

export const en = {
  'nav.home': 'Home',
  'nav.search': 'Search',
  'nav.categories': 'Categories',
  'nav.messages': 'Messages',
  'nav.profile': 'Profile',
  'nav.signIn': 'Sign in',
  'nav.signOut': 'Sign out',

  'common.thankYou': 'Thank you',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.loading': 'Loading',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.back': 'Back',
  'common.next': 'Next',

  'listing.price': 'Price',
  'listing.condition': 'Condition',
  'listing.location': 'Location',
  'listing.contactSeller': 'Contact seller',
  'listing.buy': 'Buy',
  'listing.offer': 'Make an offer',
  'listing.views': '{count, plural, one {{count} view} other {{count} views}}',

  'search.placeholder': 'Search pre-owned watches',
  'search.noResults': 'No results',
  'search.results': '{count, plural, one {{count} result} other {{count} results}}',

  'account.soldCount': '{count, plural, one {You sold {count} item} other {You sold {count} items}}',
} as const;

export type MessageKey = keyof typeof en;

/** English wrapped in the same shape as every other locale, so the completeness test iterates uniformly. */
export const enMessages: LocaleMessages = {
  locale: 'en',
  messages: en,
  untranslated: [],
};
