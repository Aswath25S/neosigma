"use client";

import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

// The current URL hash, "" during server render.
export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash, () => "");
}
