import { useState } from "react";
import { formatUnits } from "viem";
import { useBalance, useChains, useConnection, useDisconnect, useSwitchChain } from "wagmi";
import { avatarGradient, truncateAddress } from "../address.ts";
import { uiClass, type WcAppearanceProps } from "../appearance.ts";
import { Icon } from "../Icon.tsx";
import { Modal } from "../Modal.tsx";

export type AccountModalProps = WcAppearanceProps & {
  open: boolean;
  view: "account" | "networks";
  onClose: () => void;
  onView: (view: "account" | "networks") => void;
};

function formattedBalance(value: bigint, decimals: number, symbol: string): string {
  const amount = Number(formatUnits(value, decimals));
  const formatted = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(amount);
  return `${formatted} ${symbol}`;
}

export function AccountModal({ open, view, onClose, onView, className, style, theme, unstyled }: AccountModalProps) {
  const { address, chainId } = useConnection();
  const { disconnect } = useDisconnect();
  const chains = useChains();
  const switching = useSwitchChain();
  const balance = useBalance({ address });
  const [copied, setCopied] = useState(false);
  const chain = chains.find((c) => c.id === chainId);

  const copy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const title = view === "networks" ? "Networks" : "Account";

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      className={className}
      style={style}
      theme={theme}
      unstyled={unstyled}
    >
      <div className={uiClass("kui-head", unstyled)} data-kui-slot="header">
        {view === "networks" && (
          <button
            type="button"
            className={uiClass("kui-icon-btn", unstyled)}
            data-kui-slot="back"
            aria-label="Back"
            onClick={() => onView("account")}
          >
            <Icon name="arrow-left" />
          </button>
        )}
        <h2>{title}</h2>
        <button
          type="button"
          className={uiClass("kui-icon-btn", unstyled)}
          data-kui-slot="close"
          aria-label="Close"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className={uiClass("kui-body", unstyled)} data-kui-slot="body">
        {view === "account" && address && (
          <>
            <div className={uiClass("kui-account", unstyled)} data-kui-slot="account">
              <span
                className={uiClass("kui-avatar", unstyled)}
                style={{ background: avatarGradient(address) }}
                data-kui-slot="avatar"
                aria-hidden="true"
              />
              <button
                type="button"
                className={uiClass("kui-address", unstyled)}
                data-kui-slot="address"
                onClick={() => void copy()}
              >
                <span>{truncateAddress(address)}</span>
                <Icon name={copied ? "check" : "copy"} />
              </button>
              <span className={uiClass("kui-balance", unstyled)} data-kui-slot="balance">
                {balance.data
                  ? formattedBalance(balance.data.value, balance.data.decimals, balance.data.symbol)
                  : (chain?.name ?? "Connected")}
              </span>
            </div>
            <div className={uiClass("kui-list", unstyled)} data-kui-slot="actions">
              <button
                type="button"
                className={uiClass("kui-row", unstyled)}
                data-kui-slot="account-action"
                onClick={() => onView("networks")}
              >
                <span className={uiClass("kui-row-icon kui-row-icon-soft", unstyled)}>
                  <Icon name="network" />
                </span>
                <span className={uiClass("kui-row-name", unstyled)}>{chain?.name ?? `Chain ${chainId}`}</span>
                <Icon className={uiClass("kui-chevron", unstyled)} name="chevron-right" />
              </button>
              <button
                type="button"
                className={uiClass("kui-row", unstyled)}
                data-kui-slot="disconnect"
                data-tone="danger"
                onClick={() => {
                  disconnect();
                  onClose();
                }}
              >
                <span className={uiClass("kui-row-icon kui-row-icon-soft", unstyled)}>
                  <Icon name="disconnect" />
                </span>
                <span className={uiClass("kui-row-name", unstyled)}>Disconnect</span>
              </button>
            </div>
          </>
        )}
        {view === "account" && !address && (
          <p className={uiClass("kui-status", unstyled)} data-kui-slot="status" role="status">
            This wallet is no longer connected.
          </p>
        )}
        {view === "networks" && (
          <>
            <p className={uiClass("kui-section-lead", unstyled)}>Your wallet stays connected.</p>
            <div className={uiClass("kui-list", unstyled)} data-kui-slot="network-list">
              {chains.map((c) => {
                const current = c.id === chainId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={uiClass("kui-row", unstyled)}
                    data-kui-slot="network"
                    data-active={current || undefined}
                    disabled={current || switching.isPending}
                    onClick={() => switching.switchChain({ chainId: c.id })}
                  >
                    <span className={uiClass("kui-row-icon kui-chain-icon", unstyled)} aria-hidden="true">
                      {c.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className={uiClass("kui-row-name", unstyled)}>{c.name}</span>
                    {current && (
                      <span className={uiClass("kui-check", unstyled)}>
                        <Icon name="check" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
