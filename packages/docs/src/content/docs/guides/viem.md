---
title: viem
description: Use a connected Konekt provider as a viem custom transport for wallet actions and JSON-RPC reads.
---

Konekt implements the EIP-1193 request interface expected by viem’s `custom()` transport. This lets a viem wallet client sign messages and submit transactions through an approved WalletConnect session.

This integration is for EVM networks. Use Konekt directly for Solana, Bitcoin, Cosmos, or a custom namespace.

## Install

```sh
pnpm add konekt viem
```

You also need a WalletConnect project ID and an EVM JSON-RPC URL.

## Create and connect the provider

Configure the Konekt provider before creating viem clients:

```ts
import { Provider } from "konekt";
import { evm } from "konekt/eip155";
import { http as konektHttp } from "konekt/http";
import { mainnet } from "viem/chains";

const rpcUrl = "https://ethereum.example-rpc.com";

const provider = await Provider.init({
  projectId: "YOUR_PROJECT_ID",
  metadata: {
    name: "My app",
    description: "Connect to My app",
    url: window.location.origin,
    icons: [new URL("/icon.png", window.location.origin).href],
  },
  chains: evm(mainnet.id, {
    read: konektHttp(rpcUrl),
  }),
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

The `read` transport handles JSON-RPC reads sent through the provider. Wallet methods such as `personal_sign` and `eth_sendTransaction` still go to the connected wallet.

## Create viem clients

Wrap the connected provider with `custom()`:

```ts
import {
  createPublicClient,
  createWalletClient,
  custom,
  parseEther,
  verifyMessage,
} from "viem";
import { mainnet } from "viem/chains";

const transport = custom(provider);

const walletClient = createWalletClient({
  chain: mainnet,
  transport,
});

const publicClient = createPublicClient({
  chain: mainnet,
  transport,
});

const [account] = await walletClient.getAddresses();
if (!account) throw new Error("The wallet did not approve an account");
```

Both clients use the Konekt provider:

- wallet actions are routed to the WalletConnect session;
- public JSON-RPC actions use the `read` transport configured on `evm()`.

## Sign a message

```ts
const message = "Sign in to My app";

const signature = await walletClient.signMessage({
  account,
  message,
});

const valid = await verifyMessage({
  address: account,
  message,
  signature,
});
```

`signMessage()` sends `personal_sign` to the wallet. The `request_sent` listener can return the user to a mobile wallet while the request is pending.

## Send a transaction

```ts
const hash = await walletClient.sendTransaction({
  account,
  to: "0x000000000000000000000000000000000000dEaD",
  value: parseEther("0.001"),
});

const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(receipt.status);
```

The wallet approves and broadcasts the transaction. Receipt polling is a read and therefore uses the configured JSON-RPC transport.

## Use viem HTTP for reads instead

It is also valid—and common—to keep public reads outside Konekt:

```ts
import {
  createPublicClient,
  createWalletClient,
  custom,
  http as viemHttp,
} from "viem";
import { mainnet } from "viem/chains";

const walletClient = createWalletClient({
  chain: mainnet,
  transport: custom(provider),
});

const publicClient = createPublicClient({
  chain: mainnet,
  transport: viemHttp(rpcUrl),
});
```

With this arrangement:

- `walletClient` uses WalletConnect through Konekt;
- `publicClient` reads directly through viem;
- the Konekt chain does not need `read` unless other code sends reads through `provider.request()`.

Alias the two `http` imports when you use both `konekt/http` and viem’s `http()` in one module.

## Multiple EVM networks

Give each network its own Konekt read transport:

```ts
import { base, mainnet } from "viem/chains";

const provider = await Provider.init({
  projectId,
  metadata,
  chains: [
    evm(mainnet.id, { read: konektHttp(mainnetRpcUrl) }),
    evm(base.id, { read: konektHttp(baseRpcUrl) }),
  ],
});
```

The standard `custom(provider)` transport uses the provider’s active EVM chain. Switch the wallet before using a viem client configured for another chain:

```ts
await walletClient.switchChain({ id: base.id });

const baseWalletClient = createWalletClient({
  chain: base,
  transport: custom(provider),
});
```

A viem client’s `chain` option describes the network but does not switch the Konekt provider by itself.

For a read-only client that must always target one configured network without changing the active chain, wrap Konekt’s per-request target:

```ts
const baseTransport = custom({
  request: (args) => provider.request(args, `eip155:${base.id}`),
});

const basePublicClient = createPublicClient({
  chain: base,
  transport: baseTransport,
});
```

## Keep application state current

Viem clients do not subscribe to provider state automatically. Listen to provider events when your application stores the active account or chain:

```ts
provider.on("accountsChanged", (accounts) => {
  updateSelectedAccount(accounts[0]);
});

provider.on("chainChanged", (chainId) => {
  updateSelectedChain(Number.parseInt(chainId, 16));
});

provider.on("disconnect", () => {
  clearWalletState();
});
```

Framework integrations such as wagmi already maintain this reactive state. Use the [wagmi integration](../wagmi/) when building a React application around wagmi hooks.
