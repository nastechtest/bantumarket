import { describe, it, expect } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TextField, PinField, pinDigitsFrom } from '../field.js';

describe('TextField', () => {
  it('wires label → input → hint → error by id', () => {
    const markup = renderToStaticMarkup(
      <TextField id="email" label="Email" hint="We only use it for receipts" error="Email is not valid" value="" onChange={() => {}} />,
    );
    expect(markup).toContain('<label for="email"');
    expect(markup).toContain('id="email"');
    expect(markup).toContain('id="email-hint"');
    expect(markup).toContain('id="email-error"');
    expect(markup).toContain('aria-describedby="email-hint email-error"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('role="alert"');
  });

  it('is keyboard reachable: a native focusable input with no tabindex fence on it', () => {
    const markup = renderToStaticMarkup(<TextField id="q" label="Search" />);
    expect(markup).toContain('<input');
    expect(markup).not.toContain('tabindex="-1"');
  });

  it('marks required fields for both humans and readers', () => {
    const markup = renderToStaticMarkup(<TextField id="pin" label="PIN" required />);
    expect(markup).toContain('aria-required="true"');
    expect(markup).toContain('<input id="pin"');
  });

  it('omits the describedby attribute entirely when there is nothing to describe', () => {
    const markup = renderToStaticMarkup(<TextField id="solo" label="Solo" />);
    expect(markup).not.toContain('aria-describedby');
  });
});

describe('PinField', () => {
  it('asks for the numeric keyboard and the one-time-code affordance', () => {
    const markup = renderToStaticMarkup(<PinField id="pin" label="Sign-in PIN" onChange={() => {}} />);
    // react-dom/server emits these camel-cased verbatim; HTML attribute names are
    // case-insensitive, so the browser-level name is what matters.
    expect(markup).toMatch(/inputmode="numeric"/i);
    expect(markup).toMatch(/autocomplete="one-time-code"/i);
    expect(markup).toMatch(/maxlength="6"/i);
    expect(markup).toContain('<label for="pin"');
  });

  it('strips everything that is not a digit and clips to length — the paste path', () => {
    expect(pinDigitsFrom('048-212')).toBe('048212');
    expect(pinDigitsFrom('PIN: 1 2 3 4 5 6 7 8', 6)).toBe('123456');
    expect(pinDigitsFrom('abc')).toBe('');
    expect(pinDigitsFrom('1234567890')).toBe('123456');
  });
});
