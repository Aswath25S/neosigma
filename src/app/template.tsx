import { ViewTransition } from "react";

// Templates remount on every navigation, so each page fades out and the next
// fades in. The nav bar and footer live in the layout and stay put.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
