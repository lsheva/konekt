import { useState } from "react";
import type { Connector } from "wagmi";
import { useChains, useConnection } from "wagmi";
import { avatarGradient, truncateAddress } from "../address.ts";
import { themeAttribute, uiClass, type WcAppearanceProps } from "../appearance.ts";
import type { WalletFilter } from "../explorer.ts";
import { WalletModal } from "../WalletModal.tsx";
import { AccountModal } from "./AccountModal.tsx";
import { useWagmiPairing } from "./useWagmiPairing.ts";

/** Props for {@link ConnectButton}. */
export type ConnectButtonProps = WcAppearanceProps & {
  /** WalletConnect Cloud project ID used to query Wallet Explorer. */
  projectId: string;
  /** CAIP-2 chain IDs used to filter Explorer wallets. Defaults to configured wagmi chains. */
  chains?: readonly string[] | undefined;
  /** Include, exclude, and featured lists of WalletConnect Explorer IDs. */
  wallets?: WalletFilter | undefined;
  /**
   * Lazily registers and returns the Konekt wagmi connector when the config does not already
   * contain one.
   */
  getWalletConnect?: (() => Promise<Connector>) | undefined;
  /** Cancels pending connection work owned by the connector when the user dismisses pairing. */
  onDismiss?: (() => void) | undefined;
};

/**
 * Complete wagmi wallet control with connection, account, network, and disconnect dialogs.
 *
 * A wagmi connector whose `id` or `type` is `"konekt"` supplies WalletConnect pairing. Other
 * configured connectors appear as installed wallet options. Pass `getWalletConnect` to register
 * the Konekt connector only when the user starts pairing.
 */
export function ConnectButton({
  projectId,
  chains,
  wallets,
  getWalletConnect,
  onDismiss,
  className,
  style,
  theme,
  unstyled,
}: ConnectButtonProps) {
  const pairing = useWagmiPairing({ getWalletConnect });
  const { address, isConnected, chainId } = useConnection();
  const configured = useChains();
  const [walletOpen, setWalletOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountView, setAccountView] = useState<"account" | "networks">("account");
  const chain = configured.find((c) => c.id === chainId);

  if (!isConnected || !address) {
    return (
      <div
        className={uiClass("kui-root", unstyled, className)}
        style={style}
        data-kui="connect"
        data-theme={themeAttribute(theme)}
        data-connected="false"
      >
        <div className={uiClass("kui-bar", unstyled)} data-kui-slot="bar">
          <button
            type="button"
            className={uiClass("kui-connect-trigger", unstyled)}
            data-kui-slot="connect-button"
            onClick={() => setWalletOpen(true)}
          >
            Connect wallet
          </button>
        </div>
        <WalletModal
          open={walletOpen}
          projectId={projectId}
          pairing={pairing}
          chains={chains}
          wallets={wallets}
          onDismiss={onDismiss}
          onClose={() => setWalletOpen(false)}
          style={style}
          theme={theme}
          unstyled={unstyled}
        />
      </div>
    );
  }

  return (
    <div
      className={uiClass("kui-root", unstyled, className)}
      style={style}
      data-kui="connect"
      data-theme={themeAttribute(theme)}
      data-connected="true"
    >
      <div className={uiClass("kui-bar", unstyled)} data-kui-slot="bar">
        <button
          type="button"
          className={uiClass("kui-network-trigger", unstyled)}
          data-kui-slot="network-button"
          onClick={() => {
            setAccountView("networks");
            setAccountOpen(true);
          }}
        >
          <span className={uiClass("kui-network-dot", unstyled)} />
          {chain?.name ?? `Chain ${chainId}`}
        </button>
        <button
          type="button"
          className={uiClass("kui-account-trigger", unstyled)}
          data-kui-slot="account-button"
          onClick={() => {
            setAccountView("account");
            setAccountOpen(true);
          }}
        >
          <span
            className={uiClass("kui-mini-avatar", unstyled)}
            style={{ background: avatarGradient(address) }}
            aria-hidden="true"
          />
          {truncateAddress(address)}
        </button>
      </div>
      <AccountModal
        open={accountOpen}
        view={accountView}
        onClose={() => setAccountOpen(false)}
        onView={setAccountView}
        style={style}
        theme={theme}
        unstyled={unstyled}
      />
    </div>
  );
}
