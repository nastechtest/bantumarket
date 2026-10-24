import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ComponentType } from 'react';
import { tokens as defaultTokens } from '@nastech/design-tokens';
import type { Tokens } from '@nastech/design-tokens';
import type { Transport } from '@nastech/api-client';

/**
 * The provider seam.
 *
 * CONTRACT-GAP: `@nastech/i18n` and `@nastech/forms` are being written concurrently in this wave and
 * are empty, so this harness cannot build the real provider stack (I18nProvider, FormProvider) itself.
 * `render()` therefore takes a `wrapper` / `providers` argument and the controller wires the real
 * stack at integration. What lives here is the part the harness can own honestly: a token context and
 * a transport context, both of which exist so an a11y contrast check can read the SAME tokens the
 * component rendered with, and so a component under test can reach a fake transport without importing
 * one.
 */

export type Provider = ComponentType<{ readonly children: ReactNode }>;

const TokenContext = createContext<Tokens>(defaultTokens);
const TransportContext = createContext<Transport | null>(null);

export function TokenProvider({
  tokens = defaultTokens,
  children,
}: {
  readonly tokens?: Tokens;
  readonly children: ReactNode;
}) {
  return <TokenContext.Provider value={tokens}>{children}</TokenContext.Provider>;
}

export function TransportProvider({
  transport,
  children,
}: {
  readonly transport: Transport;
  readonly children: ReactNode;
}) {
  return <TransportContext.Provider value={transport}>{children}</TransportContext.Provider>;
}

/** Components that print money or read a token palette take it from here; tests can override it. */
export function useTokens(): Tokens {
  return useContext(TokenContext);
}

/** Null when no transport was provided — callers decide whether that is a bug or a static render. */
export function useTransport(): Transport | null {
  return useContext(TransportContext);
}

/**
 * Wraps `ui` in the provider list, outermost first, so `providers: [A, B]` renders `<A><B>ui</B></A>`
 * and `key` on each provider keeps React from remounting a wrapper between re-renders.
 */
export function composeProviders(ui: ReactNode, providers: readonly Provider[]): ReactNode {
  return providers.reduceRight<ReactNode>((acc, Wrapper, index) => <Wrapper key={`provider-${index}`}>{acc}</Wrapper>, ui);
}

/**
 * The harness default stack: tokens and (when given) a transport, both from contexts the harness
 * owns. A caller that passes `wrapper` or `providers` gets those INSIDE this default, never instead
 * of it — losing the token provider would silently disable the contrast rule, and a default you can
 * accidentally turn off is not a default.
 */
export function defaultProviders(transport?: Transport): Provider[] {
  const providers: Provider[] = [];
  const maybeTransport = transport;
  if (maybeTransport !== undefined) {
    providers.push(function TransportLayer({ children }: { children: ReactNode }) {
      return <TransportProvider transport={maybeTransport}>{children}</TransportProvider>;
    });
  }
  providers.push(function TokenLayer({ children }: { children: ReactNode }) {
    // `useMemo` on a stable `defaultTokens` object: the provider must not hand out a new identity
    // per render or memoised consumers re-render on every keystroke.
    const value = useMemo(() => defaultTokens, []);
    return <TokenContext.Provider value={value}>{children}</TokenContext.Provider>;
  });
  return providers;
}
