/**
 * Decorative empty-state drawing: a watch case and strap, no narrative. `aria-hidden` because
 * the words beside it carry the meaning; an alt text here would make a screen reader hear the
 * same message twice.
 */
export function EmptyIllustration({ size = 72 }: { readonly size?: number }) {
  return (
    <svg
      className="nt-empty-illustration"
      width={size}
      height={size}
      viewBox="0 0 72 72"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M27 8h18v10H27zM27 54h18v10H27z" />
      <circle cx="36" cy="36" r="17" />
      <path d="M36 27v9l6 4" />
      <path d="M22 36h-4M54 36h-4" />
    </svg>
  );
}
