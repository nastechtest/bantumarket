/**
 * Afrikaans catalogue.
 *
 * Afrikaans is a Germanic language and these are ordinary, defensible renderings of the English
 * keys — the kind you see on any SA site. The plural forms follow the CLDR rule for af (`n = 1`);
 * note `listing.views` is identical in both branches because "keer gesien" does not inflect, which
 * is a property of the language, not a copy of English.
 *
 * This file is the completeness baseline for the other translations: every `MessageKey` appears
 * exactly once, either in `messages` or in `untranslated`.
 */

import type { LocaleMessages } from './types.js';

export const af: LocaleMessages = {
  locale: 'af',
  messages: {
    'nav.home': 'Tuis',
    'nav.search': 'Soek',
    'nav.categories': 'Kategorieë',
    'nav.messages': 'Boodskappe',
    'nav.profile': 'Profiel',
    'nav.signIn': 'Meld aan',
    'nav.signOut': 'Meld af',

    'common.thankYou': 'Dankie',
    'common.yes': 'Ja',
    'common.no': 'Nee',
    'common.loading': 'Belaai',
    'common.cancel': 'Kanselleer',
    'common.save': 'Stoor',
    'common.back': 'Terug',
    'common.next': 'Volgende',

    'listing.price': 'Prys',
    'listing.condition': 'Toestand',
    'listing.location': 'Ligging',
    'listing.contactSeller': 'Kontak verkoper',
    'listing.buy': 'Koop',
    'listing.offer': 'Doen ’n aanbod',
    // "keer gesien" (times seen) does not inflect, so both plural branches are the same string —
    // an honest fact about Afrikaans, not a fallback to English.
    'listing.views': '{count, plural, one {{count} keer gesien} other {{count} keer gesien}}',

    'search.placeholder': 'Soek gebruikte horlosies',
    'search.noResults': 'Geen resultate',
    'search.results': '{count, plural, one {{count} resultaat} other {{count} resultate}}',

    'account.soldCount':
      '{count, plural, one {Jy het {count} item verkoop} other {Jy het {count} items verkoop}}',
  },
  // Afrikaans is fully translated: nothing is in the allowlist. If a key is later added to `en`,
  // it must appear here in `messages` or be listed below with a reason.
  untranslated: [],
};
