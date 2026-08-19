/** Bounded FIFO set. Returns false if `key` was already seen. */
export function createDedupe(limit = 512) {
  const seen = new Set<string>();
  return (key: string) => {
    if (seen.has(key)) return false;
    seen.add(key);
    if (seen.size > limit) {
      for (const oldest of seen) {
        seen.delete(oldest);
        break;
      }
    }
    return true;
  };
}
