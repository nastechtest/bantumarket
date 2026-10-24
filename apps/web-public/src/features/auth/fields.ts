/**
 * Local field helpers.
 *
 * CONTRACT-GAP: `@nastech/forms` is being written concurrently this wave and is empty today.
 * Everything here is the seam those packages will take over: validators return a human message
 * (or undefined), never throw, and are pure so they can move without touching call sites.
 * Marked call sites: emailError, requiredText.
 */

/**
 * Deliberately not RFC 5322. The requirement is "is this shaped like an email an OTP could be
 * sent to", not "is this a theoretical mailbox". Rejecting a valid-but-odd address at sign-up is
 * how you lose a buyer; a bounce is how you lose a receipt.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(value: string): boolean {
  return EMAIL_SHAPE.test(value.trim());
}

/** Empty is valid — email is optional in this product. Callers wanting required check separately. */
export function emailError(value: string): string | undefined {
  const v = value.trim();
  if (v === '') return undefined;
  return isEmail(v) ? undefined : 'That does not look like an email address. Check it, or continue without one.';
}

export function requiredText(value: string, label: string): string | undefined {
  return value.trim() === '' ? `${label} is required.` : undefined;
}

/**
 * SPA navigation without importing `router.tsx` from feature code: `SignIn.js` is lazy-imported by
 * the router, so a static import back would create a module cycle inside the critical chunk.
 * pushState + popstate is exactly what the router's own listener already reacts to.
 */
export function goTo(path: string): void {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
