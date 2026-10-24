import { raw, tokens } from '@nastech/design-tokens';

export interface PermissionDeniedProps {
  /** The capability name from the auth layer, e.g. `staff.dispute.assign`. */
  capability: string;
  /** Who can grant it — a named role, never "an admin somewhere". */
  roleToAsk: string;
  onGoBack?: () => void;
}

/**
 * 403, honestly rendered. The failure mode of permission screens is a shrug ("access denied")
 * that leaves the staff user re-clicking the link forever; this one names the capability and the
 * role that grants it, because that is the whole information needed to unblock. The capability
 * string is passed in — the design system must not invent auth vocabulary the server does not
 * use. `role="alert"`: the reader must announce the dead end immediately, not after the page.
 */
export function PermissionDenied({ capability, roleToAsk, onGoBack }: PermissionDeniedProps) {
  return (
    <section
      className="ds-permission-denied"
      role="alert"
      data-capability={capability}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: raw.space.s3,
        padding: raw.space.s5,
        background: tokens.surface.raised,
        borderRadius: raw.radius.md,
        borderLeft: `${raw.space.s1} solid ${raw.color.signalNegative}`,
        fontFamily: raw.type.familyText,
        color: tokens.text.primary,
      }}
    >
      <h2 style={{ margin: 0, fontFamily: raw.type.familyDisplay, fontSize: '1.25rem' }}>You do not have access to this</h2>
      <p style={{ margin: 0, fontSize: '0.875rem' }}>
        This screen requires the capability{' '}
        <code style={{ fontFamily: raw.type.familyMono, background: tokens.surface.primary, padding: `0 ${raw.space.s1}`, borderRadius: raw.radius.sm }}>
          {capability}
        </code>
        . Ask someone with the <strong>{roleToAsk}</strong> role to grant it.
      </p>
      {onGoBack ? (
        <button
          type="button"
          onClick={onGoBack}
          style={{
            alignSelf: 'flex-start',
            background: 'none',
            border: `1px solid ${raw.color.ink300}`,
            borderRadius: raw.radius.sm,
            color: tokens.text.primary,
            padding: `${raw.space.s2} ${raw.space.s4}`,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Go back
        </button>
      ) : null}
    </section>
  );
}
