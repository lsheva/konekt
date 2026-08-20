TODO:

1. chains.md - maybe rename function evm -> eip, and do helpers for solana: , bip122:, and so on, and export specific chains like solanaMainnet, ethereumMainnet etc

2. maybe replace code errors with error instances with the same codes, use instances in docs

3. const base = evm(8453, {
  read: http("https://base.example-rpc.com"),
}); -- maybe it can use viem's chain definitions

4.   method: "wallet_switchEthereumChain",
  params: [{ chainId: "0x2105" }], /

  maybe use decimal->hex conversion

5. Copy the repository’s tested factories from [`packages/integrations/src/cosmjs`](https://github.com/lsheva/konekt/blob/main/packages/integrations/src/cosmjs). Do not add a `konekt/cosmjs` wrapper.

one shouldn't copy those factories

6. explain
Recap resources (`urn:recap:`) are not implemented. Passing a `urn:recap:` entry in `resources` makes `siwe()` throw immediately, and `verifyCacao()` reports `unverifiable` for a message that carries one, so neither side can silently ignore a capability it does not enforce.

7. since siwe is very small, maybe we should bake it in, and remove plugins??

8. i think the size difference is even more dramatic. Create a sample project with appkit and compare size of it.

9.     url: window.location.origin,
    icons: [new URL("/icon.png", window.location.origin).href],

    is it needed?

10. Do we require wagmi 3, not 2?

11. do we expose UI hooks?

12.  chains={["eip155:1", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"]} - this is ugly

13. Maybe focus docs on react integration first and our UI. Then native-js integration

14. Solana --- ## Copy the bridge

Copy these four files, keeping their relative layout, because they import each other:

we dont need any copying

15. pnpm add konekt @scure/base @solana/web3.js -- why??

16. Each solana, cosmos and others should have working example apps, with tests

17. Alias the two `http` imports when you use both `konekt/http` and viem’s `http()` in one module --- maybe both can be used interchangeably

18. Add AI usage disclosure into readme.
