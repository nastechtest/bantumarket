import { useId, type ReactNode } from 'react';

/**
 * The one title block a seller screen uses. The shell deliberately renders no `<h1>`: the page
 * owns its title, and `tree-conformance` fails a second `main` landmark for the same reason.
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  children,
}: {
  readonly title: string;
  readonly eyebrow?: string;
  readonly description?: string;
  readonly children?: ReactNode;
}) {
  const descriptionId = useId();

  return (
    <header className="nt-page-header">
      <div className="nt-page-header__text">
        {eyebrow === undefined ? null : <p className="nt-page-header__eyebrow">{eyebrow}</p>}
        <h1 className="nt-page-header__title">{title}</h1>
        {description === undefined ? null : (
          <p className="nt-page-header__description" id={descriptionId}>
            {description}
          </p>
        )}
      </div>
      {children === undefined ? null : <div className="nt-page-header__actions">{children}</div>}
    </header>
  );
}
