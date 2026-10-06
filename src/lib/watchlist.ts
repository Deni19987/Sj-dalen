import { useSyncExternalStore } from "react";

// Bevakade bilar sparas per besökare i webbläsaren.
const KEY = "sjodalen-bilar-watchlist";
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

let current = read();

function toggle(id: string) {
  current = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignorera t.ex. privat läge */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWatch(id: string) {
  const list = useSyncExternalStore(subscribe, () => current);
  return [list.includes(id), () => toggle(id)] as const;
}
