---
"konekt-ui": minor
---

Open wallets by deep link on a phone. `WalletModal` now pairs as soon as it opens on a mobile browser and leaves for the wallet inside the tap that chose it, because WebKit drops a redirect to a custom scheme once the gesture has expired — previously an iPhone got a QR code it could not scan and no redirect at all. That view shows the wallet and an Open button in place of the QR, and the list hides wallets that advertised no mobile link.

A pairing about to reach its deadline is replaced with a fresh one, on a timer and when a hidden tab comes back, so a modal left open still connects. `onDismiss` now also runs for such a discarded attempt.

`useWagmiPairing` lists an injected connector only while its provider is in the browser, so mobile Safari with no extension no longer offers a dead "Installed" wallet, and a named EIP-6963 entry hides the generic one. The wagmi connector opens the wallet for `request_sent` only on a phone instead of navigating a desktop page to a native scheme.

`walletHref` no longer substitutes one platform's link for the other: a listing with only desktop links falls back to the QR code on a phone. New exports: `walletLink`, `pairingExpiry`, and `pairingRefreshDelay`.
