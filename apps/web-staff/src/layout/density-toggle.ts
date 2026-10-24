import { useCallback, useState } from 'react';
import type { Density } from '../lib/table-prefs.js';
import { readDensity, toggleDensity, writeDensity } from '../lib/table-prefs.js';

/**
 * Density is a display preference, not a permission. It is read once per mount so a table renders at
 * the operator's chosen row height immediately rather than flashing comfortable and reflowing.
 */
export function useDensity(): { readonly density: Density; readonly toggle: () => void } {
  const [density, setDensity] = useState<Density>(() => readDensity());
  const toggle = useCallback(() => {
    setDensity((current) => {
      const next = toggleDensity(current);
      writeDensity(next);
      return next;
    });
  }, []);
  return { density, toggle };
}
