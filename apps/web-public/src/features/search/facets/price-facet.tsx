import { useState } from 'react';
import type { FormEvent } from 'react';
import { formatCents } from '@nastech/design-system';
import { raw, tokens } from '@nastech/design-tokens';

/**
 * Price range facet. Buyers think in rand, the ledger thinks in cents; the conversion happens
 * exactly here, once, and the applied range is echoed back through `formatCents` so what is on
 * screen and what is in the URL are the same number through the same formatter.
 */

export type RandParse = { readonly ok: true; readonly cents: number | null } | { readonly ok: false };

/** Accepts "4500", "4 500", "R4,500"; rejects negatives, fractions, everything nonsense. */
export function parseRandInputToCents(raw: string): RandParse {
  const cleaned = raw.replace(/[R\s,]/g, '');
  if (cleaned === '') return { ok: true, cents: null };
  if (!/^\d+$/.test(cleaned)) return { ok: false };
  const rand = Number(cleaned);
  if (!Number.isSafeInteger(rand)) return { ok: false };
  return { ok: true, cents: rand * 100 };
}

export function PriceFacet({
  minCents,
  maxCents,
  onApply,
}: {
  readonly minCents: number | null;
  readonly maxCents: number | null;
  readonly onApply: (minCents: number | null, maxCents: number | null) => void;
}) {
  const [minText, setMinText] = useState(minCents === null ? '' : String(Math.floor(minCents / 100)));
  const [maxText, setMaxText] = useState(maxCents === null ? '' : String(Math.floor(maxCents / 100)));
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const min = parseRandInputToCents(minText);
    const max = parseRandInputToCents(maxText);
    if (!min.ok || !max.ok) {
      setError('Use whole rand amounts, like 4500.');
      return;
    }
    if (min.cents !== null && max.cents !== null && min.cents > max.cents) {
      setError('The minimum is above the maximum.');
      return;
    }
    setError(null);
    onApply(min.cents, max.cents);
  };

  const labelStyle = { fontSize: '0.8125rem', color: tokens.text.primary } as const;
  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box' as const,
    border: `1px solid ${raw.color.ink300}`,
    borderRadius: raw.radius.sm,
    padding: `${raw.space.s2} ${raw.space.s3}`,
    minHeight: 44,
    fontSize: '1rem',
    fontFamily: raw.type.familyText,
    color: tokens.text.primary,
  };

  return (
    <fieldset data-facet="Price" style={{ border: 'none', margin: 0, padding: 0, fontFamily: raw.type.familyText }}>
      <legend style={{ fontSize: '0.875rem', fontWeight: 600, paddingBottom: raw.space.s1, color: tokens.text.primary }}>
        Price (rand)
      </legend>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: raw.space.s2 }}>
        <div style={{ display: 'flex', gap: raw.space.s2 }}>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: raw.space.s1, ...labelStyle }}>
            Min
            <input
              name="priceMin"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 500"
              value={minText}
              onInput={(event) => setMinText(event.currentTarget.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: raw.space.s1, ...labelStyle }}>
            Max
            <input
              name="priceMax"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 6000"
              value={maxText}
              onInput={(event) => setMaxText(event.currentTarget.value)}
              style={inputStyle}
            />
          </label>
        </div>
        {error !== null ? (
          <p role="alert" style={{ margin: 0, color: raw.color.signalNegative, fontSize: '0.8125rem' }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: raw.space.s2 }}>
          <button
            type="submit"
            style={{
              minHeight: 44,
              padding: `${raw.space.s2} ${raw.space.s4}`,
              background: tokens.action.default,
              color: tokens.text.onInverse,
              border: 'none',
              borderRadius: raw.radius.sm,
              fontSize: '0.9375rem',
              cursor: 'pointer',
            }}
          >
            Apply price
          </button>
          <button
            type="button"
            onClick={() => {
              setMinText('');
              setMaxText('');
              setError(null);
              onApply(null, null);
            }}
            style={{
              minHeight: 44,
              padding: `${raw.space.s2} ${raw.space.s4}`,
              background: 'transparent',
              color: tokens.text.primary,
              border: `1px solid ${raw.color.ink100}`,
              borderRadius: raw.radius.sm,
              fontSize: '0.9375rem',
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>
      </form>
      {(minCents !== null || maxCents !== null) && error === null ? (
        <p data-applied-range="" style={{ margin: `${raw.space.s2} 0 0`, color: tokens.text.secondary, fontSize: '0.8125rem' }}>
          Applied: {minCents !== null ? formatCents(minCents) : 'any'} – {maxCents !== null ? formatCents(maxCents) : 'any'}
        </p>
      ) : null}
    </fieldset>
  );
}
