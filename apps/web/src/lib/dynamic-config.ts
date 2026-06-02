import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";

/**
 * Dynamic SDK settings.
 *
 * environmentId comes from the Dynamic dashboard. MiniPay and standard
 * injected wallets are handled by the Ethereum connector set; WalletConnect
 * is included by Dynamic by default.
 */
export const dynamicSettings = {
  environmentId: process.env["NEXT_PUBLIC_DYNAMIC_ENV_ID"] ?? "",
  walletConnectors: [EthereumWalletConnectors],
  // Celo is the home chain; destination chains are added for balance display.
  overrides: {
    evmNetworks: [
      {
        blockExplorerUrls: ["https://celoscan.io"],
        chainId: 42220,
        chainName: "Celo",
        iconUrls: ["https://app.dynamic.xyz/assets/networks/celo.svg"],
        name: "Celo",
        nativeCurrency: { decimals: 18, name: "Celo", symbol: "CELO" },
        networkId: 42220,
        rpcUrls: ["https://forno.celo.org"],
      },
    ],
  },
};
