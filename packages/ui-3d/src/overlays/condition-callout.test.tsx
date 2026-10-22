import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CLAIM_SCOPE_DISCLOSURE } from '@nastech/api-contracts';
import { ConditionCallout, hasDisclosureRef } from './condition-callout.js';
import { FRONT_CAMERA, VIEWPORT_400, makeCaption, textOf } from './overlay-fixtures.js';
import { projectPoint } from './caption-projector.js';

const projection = projectPoint([0, 0, 0.02], FRONT_CAMERA, VIEWPORT_400);

function render(caption: ReturnType<typeof makeCaption>, open?: boolean) {
  return renderToStaticMarkup(
    <ConditionCallout caption={caption} projection={projection} claimScope="geometry_and_external_condition" {...(open === undefined ? {} : { open })} />,
  );
}

describe('hasDisclosureRef', () => {
  test('absent, empty and whitespace ids are all absence', () => {
    expect(hasDisclosureRef(makeCaption('h', [0, 0, 0], { disclosureId: '' }))).toBe(false);
    expect(hasDisclosureRef(makeCaption('h', [0, 0, 0], { disclosureId: '   ' }))).toBe(false);
    // The wire type says required; a real JSON manifest can still omit it. That is absence too.
    expect(hasDisclosureRef({ ...makeCaption('h', [0, 0, 0]), disclosureId: null as unknown as string })).toBe(false);
    expect(hasDisclosureRef(makeCaption('h', [0, 0, 0]))).toBe(true);
  });
});

describe('ConditionCallout', () => {
  test('a caption with no disclosureId renders NOTHING — not a dimmed dot, not a placeholder', () => {
    expect(render(makeCaption('h1', [0, 0, 0.02], { disclosureId: '' }))).toBe('');
    expect(render(makeCaption('h2', [0, 0, 0.02], { disclosureId: '  ' }))).toBe('');
  });

  test('closed callout: button chrome only, disclosure text stays in the record until opened', () => {
    const html = render(makeCaption('crystal', [0, 0, 0.02]));
    expect(html).toContain('disc-crystal');
    expect(html).toContain('Not checked');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Crystal replaced in 2024');
  });

  test('closed callout chrome asserts nothing the contract has not: no verified-style words', () => {
    const html = render(makeCaption('crystal', [0, 0, 0.02]));
    expect(html).not.toMatch(/verified|authentic|guarantee|serviced|waterproof/i);
  });

  test('opened callout quotes the disclosure text and pins it to the record and the scope sentence', () => {
    const html = render(makeCaption('crystal', [0, 0, 0.02]), true);
    const text = textOf(html);
    expect(html).toContain('aria-expanded="true"');
    expect(text).toContain('Crystal replaced in 2024. Timekeeping not checked.');
    expect(text).toContain('disc-crystal');
    expect(text).toContain(CLAIM_SCOPE_DISCLOSURE.geometry_and_external_condition);
    expect(text).toMatch(/not this render|render, is what the dispute/i);
  });

  test('button is keyboard-operable as a button and aria-controls the panel that opens', () => {
    const html = render(makeCaption('crystal', [0, 0, 0.02]), true);
    expect(html).toMatch(/aria-controls="nt-disclosure-crystal"/);
    expect(html).toMatch(/id="nt-disclosure-crystal"/);
  });
});
