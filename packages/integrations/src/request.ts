import type { Provider } from "konekt";

/** The Konekt request surface used by application-owned ecosystem bridges. */
export type RequestClient = {
  request: (...args: Parameters<Provider["request"]>) => Promise<unknown>;
};
