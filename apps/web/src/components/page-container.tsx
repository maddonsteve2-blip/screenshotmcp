import * as React from "react";
import { cn } from "@/lib/utils";

type Width = "data" | "text" | "narrow";

const WIDTH_CLASS: Record<Width, string> = {
  // Data-heavy pages: tables, grids, stats. Cap for ultra-wide monitors.
  data: "max-w-[1600px]",
  // Long-form reading / setup guides. ~75ch for readability.
  text: "max-w-[75ch]",
  // Focused single-column forms.
  narrow: "max-w-xl",
};

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: Width;
}

/**
 * Standard top-level wrapper for every dashboard page.
 * Provides consistent max-width, gutter padding, and vertical rhythm.
 * Always horizontally centered inside the available layout column.
 *
 * Usage:
 *   <PageContainer width="data"> ... </PageContainer>
 *   <PageContainer width="text"> ... </PageContainer>
 */
export function PageContainer({
  width = "data",
  className,
  children,
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
        WIDTH_CLASS[width],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export default PageContainer;
