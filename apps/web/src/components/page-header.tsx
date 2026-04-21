import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}

/**
 * Shared dashboard page header.
 * - Title uses text-2xl (matches current convention).
 * - Actions slot sits on the right on sm+ and wraps to its own line on mobile.
 * - Icon (optional) renders inline next to the title.
 */
export function PageHeader({ title, description, icon, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-pretty">
          {icon ? <span aria-hidden="true">{icon}</span> : null}
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
