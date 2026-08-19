import type { DebugEvent, OnDebug } from "konekt";

const listeners = new Set<OnDebug>();

export const debugBus = {
  emit(e: DebugEvent) {
    for (const fn of listeners) fn(e);
  },
  subscribe(fn: OnDebug) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
