/**
 * `useTranslation` — the consumer-facing hook.
 *
 * Thin on purpose: it is the React accessor to the `Provider`'s state and nothing else. It returns
 * `t`, the active `locale` and `dir`, the `route`, and `setLocale` for a language switcher. Keeping it
 * a single `useContext` read (rather than re-deriving detection/persistence here) means the one place
 * that decides the active locale is `provider.tsx`, and a component cannot fork that decision.
 *
 * It throws when used outside a `Provider`: a silently-English render because someone forgot the
 * provider is exactly the "English pretending to be another language" failure the whole package exists
 * to prevent, so this must be loud in development, not graceful.
 */

import { useContext } from 'react';
import { I18nContext, type I18nState } from './provider.js';

export function useTranslation(): I18nState {
  const state = useContext(I18nContext);
  if (state === null) {
    throw new Error('useTranslation() must be used inside a <Provider> from @nastech/i18n.');
  }
  return state;
}
