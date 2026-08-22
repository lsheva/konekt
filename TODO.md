TODO:

2. maybe replace code errors with error instances with the same codes, use instances in docs

4.   method: "wallet_switchEthereumChain",
  params: [{ chainId: "0x2105" }], /

  maybe use decimal->hex conversion

5. Copy the repository’s tested factories from [`packages/integrations/src/cosmjs`](https://github.com/lsheva/konekt/blob/main/packages/integrations/src/cosmjs). Do not add a `konekt/cosmjs` wrapper.

one shouldn't copy those factories

6. explain
Recap resources (`urn:recap:`) are not implemented. Passing a `urn:recap:` entry in `resources` makes `siwe()` throw immediately, and `verifyCacao()` reports `unverifiable` for a message that carries one, so neither side can silently ignore a capability it does not enforce.

7. since siwe is very small, maybe we should bake it in, and remove plugins??

8. + i think the size difference is even more dramatic. Create a sample project with appkit and compare size of it.

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

19. Creating isolated providers in tests
Section titled “Creating isolated providers in tests”  --- SHould not be in getting started

21. storage: {
    getItem: async (key) => sessionStorage.getItem(key),
    setItem: async (key, value) => sessionStorage.setItem(key, value),
    removeItem: async (key) => sessionStorage.removeItem(key),
  },

maybe implement local storage, session storage and indexed db

22. Check the expiry yourself
Konekt restores a stored session without comparing session.expiry to the current time, so an expired session can come back as connected. The first wallet request then fails. If your UI depends on the session being usable,

is there a better api??

23. Reconnecting needs a new provider
disconnect() closes that provider’s relay client for good. A later connect() on the same instance emits display_uri, then rejects with relay closed instead of pairing, so the QR appears and immediately fails.
Because Provider.init() always returns the same singleton, a page offering disconnect followed by reconnect should either reload after disconnecting, or manage its own instance with Provider.create() 

could it be implemented better, so user does not think about it?

24. Parse
chainChanged
defensively
Konekt emits its own chainChanged as hex, but when a wallet sends the event Konekt forwards the wallet’s original string. A wallet that sends "1" instead of "0x1" reaches your listener unchanged. Use Number(chainId), which reads both forms, rather than assuming a 0x prefix.

should be handled by library

25. sendAsync() is not implemented. Use request(). Callback-style code needs updating. What is sendAsync?

26. Reconnecting after disconnect. Provider.init() is a process singleton, and disconnect() closes its relay client permanently. See Sessions.

i think it should be fixed

27. Any other transport except http???

28. API should include public api only, hide private funtions

1. Drop or split the Noble curve/hash fallbacks.
     Biggest overall cut (~17 kB gzip), first load
     unchanged. Older Safari/Chrome would lose
     native-curve support unless you keep a separate
     compatibility entry.
  2. Compile away log(). Relay and session always
     bundle debug strings behind a runtime
     process.env.WC_DEBUG check. A build define would
     let the bundler delete that. Hundreds of bytes,
     not kilobytes.
  3. Turn off Vite’s modulepreload polyfill in the size
     apps. Shrinks the comparison table, not the
     published library.
  4. konekt-ui: QR encoding is already lazy. The rest of
     the modal (explorer, icons, CSS) is first-load
     because the fixture imports it up front. Splitting
     “all wallets” until that view opens would help a
     real app, not the kernel.

30. console.log(provider.accounts); // ["0x…"]
console.log(provider.chainId); // 1 -- there might be few chains

