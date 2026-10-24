import { describe, expect, it } from 'bun:test';
import { readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve as rpath } from 'node:path';
import './test-dom.js';
import { SigninPage } from './signin-page.js';
import { PhoneStep } from './phone-step.js';
import { parsePhone, formatPhone, maskPhone, isSaMobile } from './phone.js';
import { createFakeAuthApi } from './api/fixtures.js';
import { byTestId, click, findButton, inputByLabel, mount, text, typeInto } from './test-dom.js';
import { goTo } from './fields.js';

/**
 * Sign-in surface + phone parsing rules + the fence.
 *
 * The fence test at the bottom is this agent's own copy of what scripts/check-3d-boundaries.ts
 * does for wired routes, applied to the graph from routes/SignIn.tsx through the feature tree.
 * The repo fence does not know our assumed paths (/register etc.) yet — until the controller
 * adds them to the route table, this test is what keeps `SignIn` provably `critical`-class clean.
 */

describe('phone.ts parsing', () => {
  it('SA national format 0XX becomes +27XX', () => {
    expect(parsePhone('082 123 4567')).toEqual({ ok: true, e164: '+27821234567', kind: 'sa-mobile' });
  });
  it('+27 form passes through', () => {
    expect(parsePhone('+27821234567').e164).toBe('+27821234567');
  });
  it('bare 27 form passes through', () => {
    expect(parsePhone('27821234567').e164).toBe('+27821234567');
  });
  it('00 international prefix becomes +', () => {
    expect(parsePhone('0027 82 123 4567').e164).toBe('+27821234567');
  });
  it('punctuation is noise, not data', () => {
    expect(parsePhone('(082) 123-4567').e164).toBe('+27821234567');
  });
  it('nine bare digits are ambiguous and are NOT guessed', () => {
    const r = parsePhone('821234567');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/will not guess/i);
  });
  it('landline trunk number is refused for SMS with honest copy', () => {
    const r = parsePhone('011 234 5678');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/landline|mobile/i);
  });
  it('wrong length after +27 is refused', () => {
    expect(parsePhone('+2782123').ok).toBe(false);
    expect(parsePhone('+278212345678').ok).toBe(false);
  });
  it('international numbers are accepted as data', () => {
    const r = parsePhone('+264 81 123 4567');
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('international');
    expect(r.e164).toBe('+264811234567');
  });
  it('too-short international is refused', () => {
    expect(parsePhone('+26481').ok).toBe(false);
  });
  it('empty is refused', () => {
    expect(parsePhone('').ok).toBe(false);
  });
  it('formatPhone groups SA numbers 2-3-4', () => {
    expect(formatPhone('+27821234567')).toBe('+27 82 123 4567');
  });
  it('maskPhone keeps first 2 and last 2 subscriber digits only', () => {
    expect(maskPhone('+27821234567')).toBe('+27 82 ••• 67');
    expect(maskPhone('+27821234567')).not.toContain('12345');
  });
  it('isSaMobile is the strict predicate', () => {
    expect(isSaMobile('+27821234567')).toBe(true);
    expect(isSaMobile('+27112345678')).toBe(false);
    expect(isSaMobile('+264811234567')).toBe(false);
  });
});

describe('phone-step component', () => {
  it('previews the parsed number before committing', async () => {
    const seen: string[] = [];
    const m = mount(<PhoneStep onNext={(e) => seen.push(e)} />);
    await m.flush();
    await typeInto(inputByLabel(m.container, 'Your phone number'), '082 123 4567');
    expect(text(byTestId(m.container, 'phone-preview'))).toContain('+27 82 123 4567');
    await click(findButton(m.container, 'Continue'));
    expect(seen).toEqual(['+27821234567']);
    m.unmount();
  });
  it('disables submit while the number is invalid', async () => {
    const m = mount(<PhoneStep onNext={() => {}} />);
    await m.flush();
    await typeInto(inputByLabel(m.container, 'Your phone number'), '011 234 5678');
    expect((byTestId(m.container, 'phone-continue') as HTMLButtonElement).disabled).toBe(true);
    m.unmount();
  });
  it('flags international numbers with the delivery truth, still allows them', async () => {
    const m = mount(<PhoneStep onNext={() => {}} />);
    await m.flush();
    await typeInto(inputByLabel(m.container, 'Your phone number'), '+264 81 123 4567');
    expect(text(byTestId(m.container, 'phone-preview'))).toMatch(/carrier/i);
    expect((byTestId(m.container, 'phone-continue') as HTMLButtonElement).disabled).toBe(false);
    m.unmount();
  });
});

describe('signin-page flow', () => {
  it('phone → code request → OTP screen shows the masked target', async () => {
    const h = createFakeAuthApi();
    const done: string[] = [];
    const m = mount(<SigninPage api={h.api} onAuthenticated={(s) => done.push(s.e164)} />);
    await m.flush();
    await typeInto(inputByLabel(m.container, 'Your phone number'), '082 000 0111');
    await click(findButton(m.container, 'Get a code by SMS'));
    await m.flush();
    expect(m.container.querySelector('[data-testid="otp-step"]')).not.toBeNull();
    expect(text(m.container)).toContain('+27 82 ••• 11');
    expect(h.outbox).toHaveLength(1);
    expect(done).toHaveLength(0);
    m.unmount();
  });

  it('completing the code authenticates and calls onAuthenticated', async () => {
    const h = createFakeAuthApi();
    const done: string[] = [];
    const m = mount(<SigninPage api={h.api} onAuthenticated={(s) => done.push(s.e164)} />);
    await m.flush();
    await typeInto(inputByLabel(m.container, 'Your phone number'), '082 000 0111');
    await click(findButton(m.container, 'Get a code by SMS'));
    await m.flush();
    await typeInto(inputByLabel(m.container, '6-digit code'), h.outbox[0]!.code);
    await click(findButton(m.container, 'Verify code'));
    await m.flush();
    expect(done).toEqual(['+27820000111']);
    const s = await h.api.getSession();
    expect(s?.e164).toBe('+27820000111');
    m.unmount();
  });

  it('password path: wrong password gets one fixed message for both no-account and wrong-pw', async () => {
    const h = createFakeAuthApi();
    h.seedUser('+27820000222', { password: 'braai weekend salt' });
    const done: string[] = [];
    const m = mount(<SigninPage api={h.api} onAuthenticated={(s) => done.push(s.e164)} />);
    await m.flush();
    await click(findButton(m.container, 'Sign in with a password'));
    await m.flush();
    const idField = inputByLabel(m.container, 'Phone number or email');
    await typeInto(idField, '+27820000999'); // no such account
    await typeInto(inputByLabel(m.container, 'Password'), 'whatever123456');
    await click(findButton(m.container, 'Use this password'));
    await m.flush();
    const unknownErr = text(byTestId(m.container, 'signin-pw-error'));
    expect(unknownErr).toMatch(/do not match/i);
    expect(unknownErr).not.toMatch(/no such|not found|unknown/i); // no enumeration oracle
    await typeInto(idField, '+27820000222'); // real account, wrong password
    await click(findButton(m.container, 'Use this password'));
    await m.flush();
    expect(text(byTestId(m.container, 'signin-pw-error'))).toBe(unknownErr);
    m.unmount();
  });

  it('password path: correct credentials authenticate', async () => {
    const h = createFakeAuthApi();
    h.seedUser('+27820000222', { password: 'braai weekend salt' });
    const done: string[] = [];
    const m = mount(<SigninPage api={h.api} onAuthenticated={(s) => done.push(s.e164)} />);
    await m.flush();
    await click(findButton(m.container, 'Sign in with a password'));
    await m.flush();
    await typeInto(inputByLabel(m.container, 'Phone number or email'), '+27820000222');
    await typeInto(inputByLabel(m.container, 'Password'), 'braai weekend salt');
    await click(findButton(m.container, 'Use this password'));
    await m.flush();
    expect(done).toEqual(['+27820000222']);
    m.unmount();
  });

  it('forgot-password link reaches the reset screen', async () => {
    const h = createFakeAuthApi();
    const m = mount(<SigninPage api={h.api} />);
    await m.flush();
    await click(findButton(m.container, 'Forgot my password'));
    await m.flush();
    expect(m.container.querySelector('[data-testid="reset-request"]')).not.toBeNull();
    m.unmount();
  });

  it('goTo pushes history so the router reacts without a page reload', () => {
    goTo('/register');
    expect(window.location.pathname).toBe('/register');
    goTo('/sign-in');
  });
});

/**
 * The fence, applied to this brief's surface right now: routes/SignIn.tsx transitively must not
 * reach the scene runtime. If the controller adds /register etc. to the route table the repo
 * fence covers them too; this test covers them until then (and permanently covers SignIn).
 */
describe('critical-route fence', () => {
  const SRC = dirname(new URL(import.meta.url).pathname);
  const REPO = rpath(SRC, '../../../../..'); // features/auth -> web-public -> apps -> repo root
  // The fence's own scene list, copied deliberately and kept narrow: `@nastech/ui-3d/fallback`,
  // `/quality` and `/tokens` are its *static* class — modules that ship no WebGL runtime and are
  // allowed on a critical route. Marking them forbidden here would make this test fail where the
  // fence passes, i.e. two different rules pretending to be one.
  const SCENE_PACKAGES = ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'];
  const STATIC_CLASS = ['@nastech/ui-3d/fallback', '@nastech/ui-3d/quality', '@nastech/ui-3d/tokens'];
  const forbidden = (spec: string): boolean => {
    if (SCENE_PACKAGES.includes(spec) || SCENE_PACKAGES.some((p) => spec.startsWith(`${p}/`))) return true;
    if (spec.startsWith('three/') || spec.startsWith('@react-three/')) return true;
    if (spec !== '@nastech/ui-3d' && !spec.startsWith('@nastech/ui-3d/')) return false;
    return !STATIC_CLASS.some((s) => spec.startsWith(s));
  };

  /**
   * Comments blanked, strings kept — the same masking scripts/check-3d-boundaries.ts does. Without
   * it, a header that says "the import graph must not reach three" is scanned as an import whose
   * clause runs to the next real `from '...'`, and this file's own header then reports SignIn as
   * importing the router. Prose is not a dependency; a fence that reads it as one gets ignored.
   */
  function maskComments(code: string): string {
    let out = '';
    let i = 0;
    while (i < code.length) {
      const c = code[i]!;
      const n = code[i + 1];
      if (c === '/' && (n === '/' || n === '*')) {
        if (n === '/') {
          while (i < code.length && code[i] !== '\n') {
            out += ' ';
            i++;
          }
          continue;
        }
        for (; i < code.length && !(code[i] === '*' && code[i + 1] === '/'); i++) out += code[i] === '\n' ? '\n' : ' ';
        out += '  ';
        i += 2;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        out += c;
        i++;
        while (i < code.length) {
          const s = code[i]!;
          out += s;
          i++;
          if (s === '\\') {
            if (i < code.length) {
              out += code[i]!;
              i++;
            }
            continue;
          }
          if (s === c) break;
        }
        continue;
      }
      out += c;
      i++;
    }
    return out;
  }

  function specifiers(code: string): string[] {
    const src = maskComments(code);
    const out: string[] = [];
    for (const m of src.matchAll(/(?:^|[\s;}])(?:import|export)\s+(?!type\b)[\s\S]*?\s*from\s*['"]([^'"]+)['"]/g)) out.push(m[1]!);
    for (const m of src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]!);
    for (const m of src.matchAll(/(?:^|[\s;}])import\s*['"]([^'"]+)['"]/g)) out.push(m[1]!);
    return out;
  }

  function resolveLocal(fromFile: string, spec: string): string | null {
    if (spec.startsWith('.')) {
      const base = rpath(dirname(fromFile), spec).replace(/\.jsx?$/, '');
      for (const c of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
        if (existsSync(c)) return c;
      }
      return null;
    }
    if (spec.startsWith('@nastech/')) {
      const m = spec.match(/^@nastech\/([\w-]+)(?:\/(.+))?$/);
      if (m === null) return null;
      const pkg = `${REPO}/packages/${m[1]}`;
      if (!existsSync(pkg)) return null;
      const target = m[2] ? `${pkg}/src/${m[2]}` : `${pkg}/src/index`;
      const stripped = target.replace(/\.jsx?$/, '');
      for (const c of [`${target}.ts`, `${target}.tsx`, `${stripped}.ts`, `${stripped}.tsx`, `${stripped}/index.ts`, `${stripped}/index.tsx`]) {
        if (existsSync(c)) return c;
      }
      return null;
    }
    return null;
  }

  function walk(file: string, chain: string[], seen: Set<string>): string | null {
    if (seen.has(file)) return null;
    seen.add(file);
    let code: string;
    try {
      code = readFileSync(file, 'utf8');
    } catch {
      return null;
    }
    for (const spec of specifiers(code)) {
      if (forbidden(spec)) return [...chain, `${file} -> ${spec}`].join('\n');
      const next = resolveLocal(file, spec);
      if (next !== null) {
        const hit = walk(next, [...chain, `${file} -> ${spec}`], seen);
        if (hit !== null) return hit;
      }
    }
    return null;
  }

  const ENTRY = rpath(SRC, '../../routes/SignIn.tsx');

  it('routes/SignIn.tsx reaches no scene runtime, statically or dynamically', () => {
    expect(existsSync(ENTRY)).toBe(true);
    const hit = walk(ENTRY, [ENTRY], new Set());
    expect(hit).toBeNull();
  });

  it('the whole features/auth tree reaches no scene runtime either', () => {
    const authIndex = `${SRC}/index.ts`;
    const hit = walk(authIndex, [authIndex], new Set());
    expect(hit).toBeNull();
  });

  it('the walk is not vacuous: a file importing three IS detected', () => {
    const tmp = `${SRC}/.fence-probe.ts`;
    writeFileSync(tmp, "import { Vector3 } from 'three';\nexport const v = Vector3;\n");
    try {
      const hit = walk(tmp, [tmp], new Set());
      expect(hit).not.toBeNull();
      expect(hit).toMatch(/three/);
    } finally {
      rmSync(tmp, { force: true });
    }
  });

  it('comment prose about the scene runtime is not an edge, and masking does not blind the walk', () => {
    const tmp = `${SRC}/.fence-prose-probe.ts`;
    const prose = "/**\n * This file must never let the import graph reach three or @react-three/fiber.\n */\n// import { Canvas } from '@react-three/fiber' was removed on purpose\n";
    writeFileSync(tmp, `${prose}export const ok = 1;\n`);
    try {
      expect(walk(tmp, [tmp], new Set())).toBeNull(); // prose alone ships nothing
    } finally {
      rmSync(tmp, { force: true });
    }
    const tmp2 = `${SRC}/.fence-prose-probe.ts`;
    writeFileSync(tmp2, `${prose}import { Vector3 } from 'three';\nexport const v = Vector3;\n`);
    try {
      expect(walk(tmp2, [tmp2], new Set())).not.toBeNull(); // the real import after the prose still fires
    } finally {
      rmSync(tmp2, { force: true });
    }
  });
});
