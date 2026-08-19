import { useState } from "react";
import type { Connector } from "wagmi";
import { useChains, useConnection } from "wagmi";
import { avatarGradient, truncateAddress } from "../address.ts";
import { themeAttribute, uiClass, type WcAppearanceProps } from "../appearance.ts";
import type { WalletFilter } from "../explorer.ts";
import { WalletModal } from "../WalletModal.tsx";
import { AccountModal } from "./AccountModal.tsx";
import { useWagmiPairing } from "./useWagmiPairing.ts";

export type ConnectButtonProps = WcAppearanceProps & {
  projectId: string;
  chains?: readonly string[] | undefined;
  wallets?: WalletFilter | undefined;
  getWalletConnect?: (() => Promise<Connector>) | undefined;
  onDismiss?: (() => void) | undefined;
};

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
