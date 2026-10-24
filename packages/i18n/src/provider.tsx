/**
 * The React provider for locale.
 *
 * Owns the active locale, its text direction, the current route (so gap records are attributable), and
 * the `t` function. Uncontrolled by default: it seeds from the persisted choice → browser tags → the
 * English default (see `detect.ts`) and persists changes; pass `locale` to drive it from app state.
 *
 * It does one thing beyond holding a string: `t` reads through the fallback chain and *records a gap*
 * when an isiZulu request is served by English, so the missing translation is visible in telemetry
 * rather than silently rendered as English under a Zulu label. The direction is exposed because the
 * app shell needs `dir` on the root element; every launch locale is LTR (asserted in `rtl.ts`).
 */

import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE, type Locale } from './locale.js';
import type { MessageKey } from './catalogue/en.js';
import { translate, type TranslateValues } from './translate.js';
import { assertNoRtlShipped, textDirection, type Direction } from './rtl.js';
import { detectLocale } from './detect.js';
import { loadLocale, saveLocale, type StorageLike } from './persist.js';

export interface I18nState {
  readonly locale: Locale;
  readonly dir: Direction;
  readonly route: string | null;
  /** Resolve `key` for the active locale, rendering its ICU pattern with `values`. */
  readonly t: (key: MessageKey, values?: TranslateValues) => string;
  readonly setLocale: (next: Locale) => void;
}

export const I18nContext = createContext<I18nState | null>(null);

export interface I18nProviderProps {
  readonly children: ReactNode;
  /** Controlled active locale. When present, the provider does not hold its own state. */
  readonly locale?: Locale;
  /** Uncontrolled seed; skipped when `locale` is given or detection supplies a value. */
  readonly initialLocale?: Locale;
  /** Current route path, for gap attribution. The app shell/router passes this. */
  readonly route?: string | null;
  readonly storage?: StorageLike | null;
  /** When uncontrolled and no saved locale exists, detect from browser tags. Default true. */
  readonly detect?: boolean;
  readonly onLocaleChange?: (next: Locale) => void;
}

export function Provider(props: I18nProviderProps) {
  // Fail fast and loudly if an RTL locale has been declared without bidirectional layout support.
  assertNoRtlShipped();

  const controlled = props.locale !== undefined;
  // `props.storage`: undefined → ambient localStorage (persist.ts default), null → no persistence.
  const storage = props.storage;
  const shouldDetect = props.detect !== false;

  const [internal, setInternal] = useState<Locale>(() => {
    if (props.initialLocale) return props.initialLocale;
    const saved = loadLocale(storage);
    return shouldDetect ? detectLocale(saved) : saved ?? DEFAULT_LOCALE;
  });

  const active = controlled ? (props.locale as Locale) : internal;

  const setLocale = useCallback(
    (next: Locale) => {
      if (!controlled) setInternal(next);
      saveLocale(next, storage);
      props.onLocaleChange?.(next);
    },
    [controlled, storage, props],
  );

  const value = useMemo<I18nState>(() => {
    const route = props.route ?? null;
    return {
      locale: active,
      dir: textDirection(active),
      route,
      t: (key, values) =>
        translate(key, values === undefined ? { locale: active, route } : { locale: active, route, values }),
      setLocale,
    };
  }, [active, props.route, setLocale]);

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
}
