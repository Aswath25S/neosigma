"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

// Keyed by path, so every navigation between pages (including one lead page
// to another) swaps the old page out and the new one in with the same fade.
// The footer sits inside, so it moves with the page instead of jumping.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <ViewTransition key={path} enter="page-in" exit="page-out" default="none">
      <div className="flex flex-1 flex-col">{children}</div>
    </ViewTransition>
  );
}
