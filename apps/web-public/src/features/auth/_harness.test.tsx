import { describe, expect, it } from 'bun:test';
import './test-dom.js';
import { useState } from 'react';
import { mount, typeInto } from './test-dom.js';

describe('probe B', () => {
  it('plain input via mount()', async () => {
    let fired = 0;
    let last = '';
    function Probe() {
      const [v, setV] = useState('');
      last = v;
      return <input id="q1" value={v} onChange={(e) => { fired++; setV(e.target.value); }} />;
    }
    const m = mount(<Probe />);
    await m.flush();
    const input = m.container.querySelector('#q1') as HTMLInputElement & { _valueTracker?: unknown };
    m.container.addEventListener('input', () => {
      fired += 100;
    });
    await typeInto(input, 'abc');
    console.log('fired:', fired, 'last:', last, 'input.value:', input.value, 'tracker:', !!input._valueTracker);
    console.log('container react internals:', Object.keys(m.container).filter((k) => k.startsWith('__react')));
    console.log('input keys:', Object.keys(input).filter((k) => k.startsWith('_react') || k.startsWith('__react')));
    expect(fired).toBeGreaterThan(0);
    m.unmount();
  });
});
