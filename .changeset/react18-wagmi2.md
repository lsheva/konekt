---
"konekt-ui": patch
---

Accept React 18 and wagmi 2 as peers. The wagmi UI calls `useAccount` and `connect`, which wagmi 3 still exports as aliases of `useConnection` and `mutate`.
