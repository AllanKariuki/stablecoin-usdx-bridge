# usdx-bridge — Ethereum

Foundry project implementing the Ethereum side of USD-X: DAMP's Stablecoin
Mint/Burn Service for the institutional/high-value settlement chain (Solana
is the high-volume, sub-second, low-fee retail/payments chain — see the
root [README](../../README.md) for the full picture).

USD-X is a native, upgradeable ERC-20 here — not a lock-and-mirror bridge.
Moving value between chains is an atomic burn-on-source / mint-on-destination
loop orchestrated by the Core Ledger, so total cross-chain supply always
reconciles to fiat reserves held in trust-bank accounts.

## Current deployment (Sepolia, chain ID 11155111)

| Item | Address |
|---|---|
| Proxy (`USDX_PROXY_ADDRESS` — the address to use) | `0xba07d67285721d6ad906c631dc945b5dab6a7e5c` |
| Implementation (`USDX.sol` logic, upgradeable) | `0x535cf7ecb1018a523547df7be4ba29a595fb90f0` |
| Bridge relayer (`USDX_BRIDGE_RELAYER`, holds `BRIDGE_ROLE`) | see `.env` (gitignored) |
| Admin (`USDX_ADMIN`, holds `DEFAULT_ADMIN_ROLE`) | see `.env` (gitignored) |

Deployed via `script/USDX.s.sol` (broadcast log in `broadcast/USDX.s.sol/11155111/`),
prior to the current work on the Solana side.

## Architecture: proxy vs. implementation

`USDX.sol` uses OpenZeppelin's UUPS upgradeable pattern, splitting the
contract into two on-chain addresses:

- **Proxy** (`ERC1967Proxy`) — the permanent address everyone (users, the
  Core Ledger, exchanges) should reference. Holds *all* state: every
  balance, every role grant, the blacklist. Forwards every call into the
  implementation via `delegatecall`.
- **Implementation** (`USDX.sol`) — the actual logic (`bridgeMint`,
  `bridgeBurn`, `pause`, `blacklist`, etc.). Swappable: whoever holds
  `UPGRADER_ROLE` can point the proxy at a new implementation without
  touching any stored balance or role.

This is the Ethereum analogue of what Solana gets natively from
`BPFLoaderUpgradeable` on its **program** account — a fixed address with
swappable logic behind it. It is *not* analogous to Solana's mint account,
which holds no code at all (see the [Solana README](../solana/README.md)
for that side of the comparison).

## Roles (`AccessControlUpgradeable`)

| Role | Held by | Grants |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | `admin` (should be a multisig, e.g. Gnosis Safe) | Grant/revoke every other role |
| `BRIDGE_ROLE` | the relayer address only | Call `bridgeMint` / `bridgeBurn` |
| `UPGRADER_ROLE` | `admin` | Swap the implementation contract |
| `PAUSER_ROLE` | `admin` | `pause()` / `unpause()` — freezes all transfers, mints, burns |
| `COMPLIANCE_ROLE` | `admin` | `blacklist()` / `unblacklist()` |

Minting is centralized by design: only the single `BRIDGE_ROLE` holder can
mint, and every `bridgeMint`/`bridgeBurn` call carries a `correlationId`
checked against `processedMints`/`processedBurns` so a transfer can't be
double-processed — this mirrors Solana's `processed_marker` PDA exactly, so
the same correlation ID is safe to check on both sides.

`decimals()` is hardcoded to `6` (overriding `ERC20Upgradeable`'s default of
18) specifically to match Solana's `USDX_DECIMALS` — a burn-N/mint-N
cross-chain transfer only preserves real value if both chains agree on
decimals.

## Setup / deployment

```bash
forge install                     # pull OpenZeppelin + other deps (see .gitmodules)
forge build
forge test

# Deploy (writes to broadcast/USDX.s.sol/<chainId>/run-latest.json)
forge script script/USDX.s.sol:USDXScript \
  --rpc-url $ETH_RPC_URL \
  --private-key $ETH_RELAYER_PRIVATE_KEY \
  --broadcast

# After build, copy the ABI for core-ledger/frontend consumption:
cp out/USDX.sol/USDX.json ../../shared/abi/USDX.json
```

After deploying, set `USDX_PROXY_ADDRESS` in `.env` to the proxy address
from the broadcast log — that's the address `core-ledger`'s Ethereum chain
client should talk to, never the implementation address.

## Foundry

Foundry consists of:

- **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
- **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
- **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
- **Chisel**: Fast, utilitarian, and verbose solidity REPL.

Docs: https://book.getfoundry.sh/

### Other useful commands

```shell
$ forge fmt          # format
$ forge snapshot     # gas snapshots
$ anvil              # local node
$ cast <subcommand>  # interact with deployed contracts
```
