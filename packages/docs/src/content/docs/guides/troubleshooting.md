---
title: Troubleshooting
description: Every error Konekt throws, what causes it, and how to fix it.
---

Konekt reports failures two ways. Request failures are `ProviderRpcError` values with an EIP-1193 `code`. Connection and relay failures are plain `Error` values identified by their message.

## Provider error codes

`ProviderRpcError` carries a `code` from `RpcErrorCode` and a message naming the specific problem.

| Code | Name | Cause | Fix |
| --- | --- | --- | --- |
| `4100` | `unauthorized` | A wallet method was called with no session. | Await `connect()`, or check `provider.connected`, before requesting. |
| `4200` | `unsupportedMethod` | The method is unknown, the wallet declined it during approval, or an EVM read has no `read` transport. | Read the message; it names the method and lists what the wallet approved. |
| `-32602` | `invalidParams` | Malformed `params`, or a `chainId` that is not in `chains`. | Check the method’s parameters, and add the chain to `chains` before targeting it. |

Wallet-side rejections keep the wallet’s own code, commonly `4001` for “user rejected the request”. Do not assume every rejection is one of the codes above.

```ts
import { ProviderRpcError } from "konekt";

async function sign(message: string) {
  try {
    return await provider.request({ method: "personal_sign", params: [message, account] });
  } catch (error) {
    if (error instanceof ProviderRpcError && error.code === 4100) {
      showConnectButton();
      return;
    }
    throw error;
  }
}
```

## Connection errors

These reject `connect()` or a pending request. Match on the message.

| Message | Meaning | What to do |
| --- | --- | --- |
| `relay rejected auth` | The relay refused the connection, closing with code 3000. | Almost always a `projectId` that is missing, wrong, or not authorized for this origin. This one is not retried. |
| `relay closed` | The socket dropped, or the provider was already disconnected. | Retry the action. If it happens right after a `disconnect()`, see [reconnecting needs a new provider](../sessions/#ending-a-session). |
| `relay connect timeout` | The socket did not open within 10 seconds. | Check network reachability and any proxy or content-security policy blocking `wss://`. |
| `relay socket error` | The WebSocket failed to open. | Same causes as a timeout; often an offline device or blocked origin. |
| `proposal expired` | Nobody approved the pairing within `ttl.propose`, 5 minutes by default. | Show a fresh QR. Shorten `ttl.propose` if you want to expire abandoned QRs sooner. |
| `request expired` | The wallet did not answer within `ttl.request`, 15 minutes by default. | Ask the user to open their wallet. `request_sent` gives you a URL to send them there. |
| `disconnected` | The session ended while the request was pending. | Clear connected state and let the user reconnect. |
| `UNSUPPORTED_CHAINS` | `chains` was empty. | Pass at least one `Chain`, as `chains: [ethereumMainnet]` or `chains: [solanaMainnet]`. |
| `Web Crypto unavailable` | The runtime exposes no Web Crypto. | Serve over HTTPS or `localhost`. Web Crypto is unavailable in insecure browser contexts. |

An aborted connection is not in this table because it is not an error condition. `connect({ signal })` rejects with a `DOMException` named `AbortError` when you abort the controller. Handle it as a cancellation:

```ts
async function connectWallet(signal: AbortSignal) {
  try {
    await provider.connect({ signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    showConnectionError(error);
  }
}
```

## Common situations

### The QR appears and immediately fails with `relay closed`

The provider was disconnected earlier. `disconnect()` closes the relay client permanently, and `Provider.init()` keeps returning that same instance. Reload the page after disconnecting, or manage instances with `Provider.create()`. See [Sessions](../sessions/#ending-a-session).

### No QR appears when the user clicks connect

A stored session was restored, so the provider is already connected and does not need a pairing. Check `provider.connected` and show the connected state instead of a QR.

### `4100` on the first request after a page reload

The stored session did not restore. Common causes: `storage: null`, a private-browsing context where `localStorage` throws, a different origin than the one that paired, or the user clearing site data. Read `provider.connected` after `Provider.init()` rather than assuming a session exists.

### The session restored, but every request fails

The stored session is past its expiry. Konekt restores it without checking the clock. Compare `provider.session?.expiry` against the current time after `init()` and disconnect if it has passed. See [Sessions](../sessions/#restoring-a-session).

### `connect()` never resolves and never rejects

The `AbortSignal` was already aborted when you passed it. Konekt subscribes to the signal after publishing the proposal, so an abort that already happened is never observed, and the attempt waits out `ttl.propose`. Create the `AbortController` when the user starts connecting, not before.

### `eth_getBalance` fails with `4200` but signing works

Reads need a transport. Wallet methods go to the wallet; JSON-RPC reads go to the chain’s `read`:

```ts
import { http } from "konekt/http";
import { evm } from "konekt/eip155";

chains: [evm(1, { read: http("https://ethereum.example-rpc.com") })];
```

Configure `read` on every EVM chain you read from. See [Chains and networks](../chains/#add-json-rpc-reads).

### Reads return data from the wrong network

The wallet switched to a chain that is not in your `chains` configuration, and reads fell back to the first configured EVM chain’s transport. Configure every network your app supports, and treat `chainChanged` for an unknown chain as an unsupported-network state.

### `chainChanged` gives a value that is not hex

Konekt emits hex, but a wallet’s own event is forwarded unchanged, so `"1"` can reach your listener. Use `Number(chainId)`, which reads both forms.

### The wallet approved fewer chains or methods than requested

`chains` is what your app proposed, not what the wallet granted. Read `provider.session?.namespaces` for what was actually approved, and `provider.accountsByChain` for the addresses. A method the wallet declined fails locally with `4200`.

### Nothing happens on mobile after sending a request

The app must open the wallet. Listen for `request_sent` and navigate to its `url`:

```ts
provider.on("request_sent", ({ url }) => {
  if (url) window.location.assign(url);
});
```

`url` is `undefined` when the wallet advertised no redirect. See [Wallet UI](../wallet-ui/#open-the-wallet-for-a-request).

## Getting more detail

Pass `onDebug` to see relay and protocol events without exposing payload contents:

```ts
import { Provider } from "konekt";
import { ethereumMainnet } from "konekt/eip155";

const provider = await Provider.init({
  projectId,
  metadata,
  chains: [ethereumMainnet],
  onDebug: (event) => console.log(event),
});
```

During local development, `WC_DEBUG=1` prints a truncated protocol trace. See [Diagnostics](../sessions/#diagnostics).

If the problem looks like a bug in Konekt, open an issue with the `onDebug` output, the wallet and its version, and a minimal reproduction: [github.com/lsheva/konekt/issues](https://github.com/lsheva/konekt/issues).
