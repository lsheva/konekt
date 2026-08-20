---
title: ethers
description: Use a connected Konekt provider as an ethers v6 BrowserProvider for signing and JSON-RPC reads.
---

Konekt implements the EIP-1193 `request` interface expected by ethers v6 `BrowserProvider`. Wallet methods go through the WalletConnect session. JSON-RPC reads go through the optional `konekt/http` transport on the EVM chain.

This integration is for EVM networks. Use Konekt directly, or the [Solana](../solana/) and [CosmJS](../cosmjs/) bridges, for other namespaces.

## Install

```sh
pnpm add konekt ethers
```

You also need a WalletConnect project ID and an EVM JSON-RPC URL.

## Create and connect the provider

Configure Konekt before wrapping it with ethers. Reads such as `getBalance()` and receipt polling use the chain’s `read` transport:

```ts
import { Provider } from "konekt";
import { evm } from "konekt/eip155";
import { http } from "konekt/http";

const rpcUrl = "https://ethereum.example-rpc.com";

const provider = await Provider.init({
  projectId: "YOUR_PROJECT_ID",
  metadata: {
    name: "My app",
    description: "Connect to My app",
    url: window.location.origin,
    icons: [new URL("/icon.png", window.location.origin).href],
  },
  chains: evm(1, { read: http(rpcUrl) }),
});

provider.on("display_uri", (uri) => {
  // Render the URI as a QR code, or use WalletModal from konekt-ui.
});

provider.on("request_sent", ({ url }) => {
  if (url) window.location.assign(url);
});

if (!provider.connected) {
  await provider.connect();
}
```

This snippet omits the pairing UI and cancellation for brevity. See [Wallet UI](../wallet-ui/) for rendering the URI, aborting an attempt, and separating a user cancellation from a real failure.

## Wrap the provider with ethers

```ts
import { BrowserProvider, parseEther, verifyMessage } from "ethers";

const ethersProvider = new BrowserProvider(provider);
const signer = await ethersProvider.getSigner();
const address = await signer.getAddress();
```

`getSigner()` uses `eth_accounts` / `eth_requestAccounts` answered from the approved session. It does not start pairing. Call `provider.connect()` first.

## Sign a message

```ts
const message = "Sign in to My app";
const signature = await signer.signMessage(message);
const recovered = verifyMessage(message, signature);
```

That sends `personal_sign` to the wallet. The `request_sent` listener can return the user to a mobile wallet while the request is pending.

## Send a transaction

```ts
const tx = await signer.sendTransaction({
  to: "0x000000000000000000000000000000000000dEaD",
  value: parseEther("0.001"),
});
const receipt = await tx.wait();
console.log(receipt?.status);
```

The wallet approves and broadcasts the transaction. Gas estimation, nonce lookup, and receipt polling are reads and therefore use `konekt/http`.

Without a `read` transport, those reads fail with error `4200`. You can instead keep public reads on a separate `ethers.JsonRpcProvider(rpcUrl)` and use Konekt only for the signer:

```ts
import { JsonRpcProvider } from "ethers";

const reader = new JsonRpcProvider(rpcUrl);
```

In that arrangement the Konekt chain does not need `read` unless other code still sends reads through `provider.request()`.

## Keep application state on the Konekt provider

Ethers clients do not own the WalletConnect session. Listen to the original Konekt provider for account, chain, and disconnect changes:

```ts
provider.on("accountsChanged", (accounts) => {
  const [next] = accounts;
  if (next) updateSelectedAccount(next);
  else clearWalletState();
});

provider.on("chainChanged", (chainId) => {
  // Number() reads both "0x1" and the "1" some wallets send.
  updateSelectedChain(Number(chainId));
});

provider.on("disconnect", () => {
  clearWalletState();
});
```

After `accountsChanged` or `chainChanged`, call `ethersProvider.getSigner()` again if you still need an ethers signer. `BrowserProvider` does not switch the WalletConnect session by itself.

To ask the wallet to switch networks, send `wallet_switchEthereumChain` through Konekt or ethers `send()`.

## Multiple EVM networks

Give each network its own Konekt read transport, then switch the wallet before using an ethers signer against another chain:

```ts
const mainnetRpcUrl = "https://ethereum.example-rpc.com";
const baseRpcUrl = "https://base.example-rpc.com";

// Pass this as the `chains` option of the Provider.init() call above.
const chains = [
  evm(1, { read: http(mainnetRpcUrl) }),
  evm(8453, { read: http(baseRpcUrl) }),
];

await provider.request({
  method: "wallet_switchEthereumChain",
  params: [{ chainId: "0x2105" }], // Base, decimal 8453
});
```

A `BrowserProvider` constructed for one network still talks to whichever chain is active on the Konekt provider.

## Check with a wallet

Automated tests cover ethers signing and sending against a local chain. Confirm pairing QR cancellation, mobile request redirects, and chain switching with the wallets you support before shipping.
