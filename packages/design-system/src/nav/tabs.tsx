import { useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { raw, tokens } from '@nastech/design-tokens';

export interface TabDef {
  readonly id: string;
  readonly label: string;
  readonly panel: ReactNode;
  readonly disabled?: boolean;
}

export interface TabsProps {
  tabs: readonly TabDef[];
  /** Controlled when provided; uncontrolled (first tab) otherwise. */
  selectedId?: string;
  onSelect?: (id: string) => void;
  label?: string;
}

/**
 * Tabs on the ARIA pattern with automatic activation: arrows move selection and focus together,
 * which is right when panels are cheap (this package's case) and is the version that must be
 * implemented correctly because *disabled* tabs are where half-built tab lists break — they are
 * skipped, never landed on. The selected tab is the only tab stop (`tabIndex 0`), panels get
 * focus themselves so keyboard users can Tab into panel content and back out.
 */
export function Tabs({ tabs, selectedId, onSelect, label }: TabsProps) {
  // Uncontrolled default is the first tab; a controlled parent ignores this and passes selectedId.
  const [internalId, setInternalId] = useState<string>(tabs[0]?.id ?? '');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (id: string): void => {
    setInternalId(id);
    onSelect?.(id);
  };

  const current = selectedId ?? internalId;

  const move = (from: number, direction: 1 | -1, wrapTo?: number): void => {
    if (tabs.length === 0) return;
    let cursor = wrapTo ?? from;
    for (let hops = 0; hops < tabs.length; hops += 1) {
      const tab = tabs[cursor];
      if (tab && !tab.disabled) {
        select(tab.id);
        tabRefs.current[cursor]?.focus();
        return;
      }
      cursor = (cursor + direction + tabs.length) % tabs.length;
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent, index: number) => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        move(index, 1, (index + 1) % tabs.length);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        move(index, -1, (index - 1 + tabs.length) % tabs.length);
        break;
      case 'Home':
        event.preventDefault();
        move(index, 1, 0);
        break;
      case 'End':
        event.preventDefault();
        move(index, -1, tabs.length - 1);
        break;
    }
  };

  const currentIndex = tabs.findIndex((t) => t.id === current);
  const active = currentIndex >= 0 ? tabs[currentIndex] : tabs[0];

  return (
    <div className="ds-tabs" style={{ fontFamily: raw.type.familyText }}>
      <div role="tablist" aria-label={label} style={{ display: 'flex', gap: raw.space.s1, borderBottom: `1px solid ${raw.color.ink100}` }}>
        {tabs.map((tab, index) => {
          const selected = tab.id === active?.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              disabled={tab.disabled === true}
              tabIndex={selected ? 0 : -1}
              data-state={selected ? 'active' : 'inactive'}
              onClick={() => {
                if (tab.disabled) return;
                select(tab.id);
              }}
              onKeyDown={(event) => onKeyDown(event, index)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: selected ? `${raw.space.s1} solid ${tokens.action.default}` : `${raw.space.s1} solid transparent`,
                padding: `${raw.space.s2} ${raw.space.s3}`,
                fontSize: '0.875rem',
                color: selected ? tokens.text.primary : tokens.text.secondary,
                cursor: tab.disabled ? 'default' : 'pointer',
                opacity: tab.disabled ? 0.5 : 1,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {active ? (
        <div
          role="tabpanel"
          id={`panel-${active.id}`}
          aria-labelledby={`tab-${active.id}`}
          tabIndex={0}
          style={{ padding: raw.space.s3, color: tokens.text.primary, fontSize: '0.875rem' }}
        >
          {active.panel}
        </div>
      ) : null}
    </div>
  );
}
