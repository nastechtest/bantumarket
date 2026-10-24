import './dom-setup.js';
import { describe, it, expect, afterEach } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { Tabs } from '../nav/tabs.js';
import type { TabDef } from '../nav/tabs.js';

const tabs: TabDef[] = [
  { id: 'open', label: 'Open', panel: <p>Open queue</p> },
  { id: 'paused', label: 'Paused', panel: <p>Paused queue</p> },
  { id: 'archive', label: 'Archive', panel: <p>Archived</p>, disabled: true },
];

function key(el: Element, k: string) {
  return el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Tabs markup contract', () => {
  it('tablist/tab/tabpanel wired by id, exactly one selected, one tab stop', () => {
    const markup = renderToStaticMarkup(<Tabs tabs={tabs} label="Listing states" />);
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-label="Listing states"');
    expect(markup.match(/role="tab"/g)?.length).toBe(3);
    expect(markup.match(/aria-selected="true"/g)?.length).toBe(1);
    // Two and only two `tabindex="0"` in the whole widget: the selected tab (roving ring) and
    // the panel, which must be focusable so keyboard users can enter its content from the tab.
    expect(markup.match(/tabindex="0"/g)?.length).toBe(2);
    expect(markup.match(/role="tab"[^>]*tabindex="-1"/g)?.length).toBe(2); // the other two tabs
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain('aria-labelledby="tab-open"');
    expect(markup).toContain('id="panel-open"');
    expect(markup).toContain('Open queue');
    // Negative fixture: the disabled tab is never selected and carries a control the reader
    // announces as unavailable.
    expect(markup).toContain('disabled');
    expect(markup).toMatch(/aria-selected="false"[^>]*tabindex="-1"/);
  });
});

describe('Tabs keyboard contract', () => {
  let root: Root | null = null;
  afterEach(() => {
    root?.unmount();
    root = null;
    document.body.innerHTML = '';
  });

  async function mountOnDom() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<Tabs tabs={tabs} label="Listing states" />);
    });
    return host;
  }

  it('ArrowRight advances selection and focus together, skipping the disabled tab', async () => {
    const host = await mountOnDom();
    const [openTab, pausedTab, archiveTab] = Array.from(host.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
    openTab!.focus();

    await act(async () => {
      key(openTab!, 'ArrowRight');
    });
    expect(document.activeElement).toBe(pausedTab);
    expect(pausedTab!.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('[role="tabpanel"]')?.textContent).toContain('Paused queue');

    // Next step would be Archive — disabled, so the ring wraps to Open.
    await act(async () => {
      key(pausedTab!, 'ArrowRight');
    });
    expect(document.activeElement).toBe(openTab);
    expect(archiveTab!.disabled).toBe(true);
  });

  it('ArrowLeft wraps backwards past the start to the last enabled tab', async () => {
    const host = await mountOnDom();
    const [openTab, pausedTab] = Array.from(host.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
    openTab!.focus();
    await act(async () => {
      key(openTab!, 'ArrowLeft');
    });
    expect(document.activeElement).toBe(pausedTab);
  });

  it('Home and End jump within the enabled set', async () => {
    const host = await mountOnDom();
    const [openTab, pausedTab, archiveTab] = Array.from(host.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
    openTab!.focus();
    await act(async () => {
      key(openTab!, 'End');
    });
    // End targets the last position (Archive); it is disabled, so the walk continues backward
    // to the nearest enabled tab — Paused. Colour/position never decide this; enabledness does.
    expect(archiveTab!.disabled).toBe(true);
    expect(document.activeElement).toBe(pausedTab);

    await act(async () => {
      key(pausedTab!, 'Home');
    });
    expect(document.activeElement).toBe(openTab);
  });

  it('clicking a disabled tab changes nothing', async () => {
    const host = await mountOnDom();
    const archive = host.querySelectorAll('[role="tab"]')[2] as HTMLButtonElement;
    await act(async () => {
      archive.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.querySelector('[role="tab"][aria-selected="true"]')).not.toBeNull();
    expect(host.querySelectorAll('[role="tab"]')[0]!.getAttribute('aria-selected')).toBe('true');
  });
});
