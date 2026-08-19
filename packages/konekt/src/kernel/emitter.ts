export type Handler<T> = (payload: T) => void;

export function createEmitter<E extends Record<string, unknown>>() {
  const map = new Map<keyof E, Set<Handler<unknown>>>();

  const on = <K extends keyof E>(event: K, fn: Handler<E[K]>) => {
    const set = map.get(event) ?? new Set();
    set.add(fn as Handler<unknown>);
    map.set(event, set);
  };

  const off = <K extends keyof E>(event: K, fn: Handler<E[K]>) => {
    map.get(event)?.delete(fn as Handler<unknown>);
  };

  const once = <K extends keyof E>(event: K, fn: Handler<E[K]>) => {
    const wrap: Handler<E[K]> = (p) => {
      off(event, wrap);
      fn(p);
    };
    on(event, wrap);
  };

  const emit = <K extends keyof E>(event: K, payload: E[K]) => {
    for (const fn of map.get(event) ?? []) fn(payload);
  };

  return { on, once, off, removeListener: off, emit };
}

export type Emitter<E extends Record<string, unknown>> = ReturnType<typeof createEmitter<E>>;
