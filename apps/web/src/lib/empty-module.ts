// Stub for optional wagmi "tempo" connectors' `accounts` dependency, which
// isn't published and isn't used by the connectors AppKit actually wires up
// (injected / WalletConnect / Coinbase). Aliased in next.config.ts so
// Turbopack can resolve the dynamic `import('accounts')` at build time.
export {};
