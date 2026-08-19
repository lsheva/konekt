import { useCallback, useRef } from "react";
import type { Connector } from "wagmi";
import { useConfig } from "wagmi";
import { ConnectButton } from "konekt-ui/wagmi";
import "konekt-ui/styles.css";
import { konektOptions } from "./Wagmi";
import { abortPairing, konekt } from "./konekt";

export const Connect: React.FC = () => {
  const config = useConfig();
  const connectorRef = useRef<Connector>(undefined);

  const getWalletConnect = useCallback(async () => {
    if (connectorRef.current) return connectorRef.current;
    const connector = config._internal.connectors.setup(konekt(konektOptions));
    connectorRef.current = connector;
    return connector;
  }, [config]);

  return (
    <div style={{ padding: 24 }}>
      <h1>Wagmi v3 + konekt</h1>
      <ConnectButton
        projectId={konektOptions.projectId}
        getWalletConnect={getWalletConnect}
        onDismiss={abortPairing}
      />
    </div>
  );
};
