/**
 * Keyboard help for the 3D viewer.
 *
 * The key list is passed in, not imported from `@nastech/ui-3d/controls` at module load: `scene-mount`
 * (browser-only, lazy) forwards the package's authoritative `KEY_HELP`, and this component stays
 * dependency-free so it renders — and is testable — without touching an unexported subpath. Wording is
 * owned by the controls package, so the panel never re-types a shortcut and drifts from the handler.
 */

export interface KeyHelpEntry {
  readonly key: string;
  readonly says: string;
}

export interface KeyboardHelpProps {
  readonly entries: readonly KeyHelpEntry[];
  readonly summary?: string;
}

export function KeyboardHelp({ entries, summary = 'Keyboard controls for the 3D view' }: KeyboardHelpProps) {
  if (entries.length === 0) return null;
  return (
    <div className="nt-keyboard-help" role="group" aria-label={summary}>
      <h3 className="nt-keyboard-help__title">Keyboard</h3>
      <dl className="nt-keyboard-help__list">
        {entries.map(({ key, says }) => (
          <div className="nt-keyboard-help__row" key={key}>
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{says}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
