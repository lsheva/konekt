// biome-ignore-all lint/suspicious/noExplicitAny: third-party values are stubs while samples exercise konekt

import type { Metadata, Provider, ProviderDeps } from "konekt";
import type { evm } from "konekt/eip155";

/**
 * The vocabulary guide samples may use without declaring it. `check-snippets.mjs` puts these in
 * scope so a sample can show one idea instead of a whole application. A sample that declares its
 * own binding of the same name shadows the one here.
 */
declare global {
  /** Project ID from WalletConnect Cloud. */
  const projectId: string;
  /** App name, description, URL, and icons shown by the wallet. */
  const metadata: Metadata;
  /** JSON-RPC endpoint the application reads from. */
  const rpcUrl: string;
  /** A provider connected to one EVM chain, as `Getting started` builds it. */
  const provider: Awaited<ReturnType<typeof Provider.init<[ReturnType<typeof evm>]>>>;
  /** An EVM address the application has selected. */
  const account: string;
  /** An address on a non-EVM chain, as each namespace guide reads it from the session. */
  const address: string;
  /** Clients the integration guides build in their setup sample, before showing one action. */
  const walletClient: any;
  const publicClient: any;
  const signer: any;
  /** A stand-in session for the samples that inject dependencies into `Provider.create`. */
  const fakeSession: NonNullable<ProviderDeps["session"]>;

  /** Application UI the samples call instead of rendering their own. */
  function showPairingUri(uri: string): void;
  function renderQrCode(uri: string): void;
  function hideQrCode(): void;
  function showConnectionError(error: unknown): void;
  function showAccount(address: string): void;
  function showConnectButton(): void;
  function showDisconnectedState(): void;
  function updateSelectedAccount(address: string | undefined): void;
  function updateSelectedChain(chainId: number): void;
  function refreshAddresses(addresses: unknown): void;
  function clearWalletState(): void;

  /** Environment access used by the framework samples. */
  const process: { env: Record<string, string | undefined> };
  interface ImportMeta {
    readonly env: Record<string, any>;
  }
}
