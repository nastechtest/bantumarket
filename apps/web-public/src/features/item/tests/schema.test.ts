import { describe, it, expect } from 'bun:test';
import { money } from '@nastech/api-contracts';
import { buildProductSchema, itemCanonicalUrl, productSchemaScriptProps } from '../schema.js';
import { zarDisplay, zarMajorMinor } from '../price-format.js';
import { fixtureDetail } from '../api/fixtures.js';

describe('zarMajorMinor (JSON-LD price)', () => {
  it('emits machine decimals from integer cents, never float artifacts', () => {
    expect(zarMajorMinor(money(420_000))).toBe('4200.00');
    expect(zarMajorMinor(money(45_000))).toBe('450.00');
    expect(zarMajorMinor(money(45_050))).toBe('450.50');
    expect(zarMajorMinor(money(5))).toBe('0.05');
    expect(zarMajorMinor(money(1))).toBe('0.01');
    // Large whole-cent values keep exact: float division at 1e11 cents loses the last digits.
    expect(zarMajorMinor(money(1_108_800_000_000))).toBe('11088000000.00');
  });

  it('refuses a negative listing price instead of shipping it into an offer', () => {
    expect(() => zarMajorMinor(money(-100))).toThrow(RangeError);
  });
});

describe('zarDisplay (fallback human price)', () => {
  it('groups thousands and hides whole-rand cents, matching design-system formatZar output', () => {
    expect(zarDisplay(money(420_000))).toBe('R4,200');
    expect(zarDisplay(money(123_456))).toBe('R1,234.56');
    expect(zarDisplay(money(45_000))).toBe('R450');
    expect(zarDisplay(money(-420_000))).toBe('-R4,200');
  });
});

describe('buildProductSchema', () => {
  const detail = fixtureDetail('lst_01')!;
  const schema = buildProductSchema(detail, 'https://nastech.market');

  it('is a schema.org Product carrying exactly one ZAR Offer', () => {
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('Product');
    expect(schema.offers['@type']).toBe('Offer');
    expect(schema.offers.priceCurrency).toBe('ZAR');
  });

  it('the offer price is the contract money value rendered by integer arithmetic', () => {
    expect(schema.offers.price).toBe('4200.00');
    expect(schema.offers.price).toBe(zarMajorMinor(detail.price));
  });

  it('availability follows the DTO flag, and used is the only condition the pilot lists under', () => {
    expect(schema.offers.availability).toBe('https://schema.org/InStock');
    expect(buildProductSchema(fixtureDetail('lst_03')!, 'https://nastech.market').offers.availability).toBe(
      'https://schema.org/OutOfStock',
    );
    expect(schema.offers.itemCondition).toBe('https://schema.org/UsedCondition');
  });

  it('images list the poster first, then every still — no model file ever enters the schema', () => {
    expect(schema.image[0]).toBe(detail.poster.url);
    expect(schema.image).toHaveLength(1 + detail.stills.length);
    for (const url of schema.image) expect(url).not.toMatch(/\.glb|model\//);
  });

  it('the seller is named as the seller; the platform claims nothing in the schema', () => {
    expect(schema.offers.seller.name).toBe(detail.seller.displayName);
    const json = JSON.stringify(schema).toLowerCase();
    for (const banned of ['verified', 'certified', 'authentic', 'guaranteed']) {
      expect(json, `schema contains "${banned}"`).not.toContain(banned);
    }
  });

  it('canonical url joins base and listing id, escaped', () => {
    expect(itemCanonicalUrl('https://nastech.market/', 'lst_01')).toBe('https://nastech.market/item/lst_01');
    expect(itemCanonicalUrl('https://nastech.market', 'a b')).toContain('a%20b');
  });

  it('script props embed parseable JSON and cannot break out of the script tag', () => {
    const evil = { ...fixtureDetail('lst_02')!, title: 'X </script><script>alert(1)</script>' };
    const props = productSchemaScriptProps(evil, 'https://nastech.market');
    expect(props.type).toBe('application/ld+json');
    expect(props.dangerouslySetInnerHTML.__html).not.toContain('</script>');
    const parsed = JSON.parse(props.dangerouslySetInnerHTML.__html.replace(/<\\\//g, '</'));
    expect(parsed.name).toBe(evil.title);
  });
});
