import { useId, type ReactNode } from 'react';

/** A labelled block inside a page. Two levels maximum: page header h1, section h2. */
export function Section({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  const headingId = useId();

  return (
    <section className="nt-section" aria-labelledby={headingId}>
      <h2 className="nt-section__title" id={headingId}>
        {title}
      </h2>
      {description === undefined ? null : <p className="nt-section__description">{description}</p>}
      <div className="nt-section__body">{children}</div>
    </section>
  );
}
