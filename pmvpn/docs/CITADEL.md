# Citadel — Blockchain-Permanent, Token-Gated Communication Rooms

*A room that outlives its server. Access earned by asset, not invitation. Federation through chain, not protocol.*

---

## Summary

A **Citadel** is a blocktalk room whose identity lives on a blockchain. When the server hosting a Citadel shuts down, the room does not die — its registry record, access policy, and metadata persist on-chain. Any authorized wallet can resurrect the room on a new server, restore the configuration, and resume operations. Participants discover Citadels by querying the chain and prove their right to join by holding a specific token or NFT.

This is the fourth room type in [blocktalk v2](BLOCKTALK.md), extending the existing taxonomy:

| Room Type | Persistence | Access Model | Discovery | Survives Server Death |
|-----------|------------|-------------|-----------|:---------------------:|
| Private Room | Ephemeral (memory) | Invite-only | None | No |
| Boardroom | Filesystem | Invite-only | None | No |
| Dojo | Session (memory) | Open (link) | None | No |
| **Citadel** | **On-chain** | **Token-gated** | **On-chain registry** | **Yes** |

Citadels are the building block for distributed social networking on the [cypherpunk2048](https://github.com/cypherpunk2048) stack. Token communities create Citadels gated by their asset. Any server can host. The blockchain is the federation layer. Your wallet is your passport.

---

## How Permanence Works

### The Problem with Servers

Every communication platform in history has had the same vulnerability: the server. When the server dies — through hardware failure, decommissioning, censorship, bankruptcy, or simply forgetting to pay the hosting bill — the conversations it held die with it. IRC channels, Slack workspaces, Discord servers, Telegram groups — all are one `rm -rf` away from oblivion. The identity of the room, its membership rules, its history, and its purpose exist only as bits on a machine someone else controls.

This is not a theoretical concern. It is the default state of digital communication. Your conversations exist at the pleasure of an operator.

### The Blockchain as Registry, Not Database

A Citadel achieves permanence by separating **identity** from **infrastructure**.

The room's identity — who created it, who can access it, what the rules are — lives on a blockchain. The blockchain is append-only and distributed across thousands of nodes. No single operator can delete a record. No server failure can erase the room's existence. The identity persists as long as the chain persists.

The room's content — messages, files, conversation history — lives on the transport layer (self-hosted node, [XMTP](https://xmtp.org/) network, or direct). Content is ephemeral by nature and encrypted by design. The chain does not store what you said. It stores the fact that a room exists, who owns it, and who is allowed in.

This separation means:

```
  ┌───────────────────────────────────────────────────────────────┐
  │                     IDENTITY LAYER                            │
  │                     (blockchain)                               │
  │                                                               │
  │  Immutable. Distributed. Survives anything.                   │
  │                                                               │
  │  • roomId: unique identifier (hash)                          │
  │  • creator: wallet address that paid the creation fee         │
  │  • gate: what token you must hold to enter                   │
  │  • metadataURI: where to find the room's full configuration  │
  │  • transportHint: where the room is currently hosted          │
  │  • active: whether the room is alive                         │
  │  • createdAt: when this room was born                        │
  │                                                               │
  │  This record exists for as long as the blockchain exists.     │
  │  No server, no company, no government can delete it.          │
  └───────────────────────────────────────────────────────────────┘
                              │
                              │ points to
                              ▼
  ┌───────────────────────────────────────────────────────────────┐
  │                    METADATA LAYER                              │
  │                    (IPFS / Arweave)                            │
  │                                                               │
  │  Content-addressed. Replicated. Verifiable.                   │
  │                                                               │
  │  • name, description, avatar                                 │
  │  • full permission policy (roles, throttle, limits)          │
  │  • encryption scheme, transport preference                   │
  │  • tags for discoverability                                  │
  │  • creator's wallet signature (proves authenticity)          │
  │                                                               │
  │  Stored at a content-addressed URI (IPFS CID / Arweave tx). │
  │  The URI is on-chain. The content is off-chain but immutable │
  │  (content-addressing means the hash IS the address — if the  │
  │  content changes, the address changes, and the chain record  │
  │  would no longer match).                                     │
  └───────────────────────────────────────────────────────────────┘
                              │
                              │ configures
                              ▼
  ┌───────────────────────────────────────────────────────────────┐
  │                   TRANSPORT LAYER                              │
  │                   (self-hosted / XMTP / direct)               │
  │                                                               │
  │  Replaceable. Encrypted. Sovereign.                           │
  │                                                               │
  │  • WebSocket server on any machine (self-hosted)             │
  │  • XMTP group conversation (decentralized relay)             │
  │  • Direct signed messages (clipboard, QR, any channel)       │
  │                                                               │
  │  This is the part that can die. And that's fine.             │
  │  The identity layer lets you rebuild it from scratch.         │
  └───────────────────────────────────────────────────────────────┘
```

### The Thread of Immutability

The chain provides an unbroken **thread** of events for every Citadel. Each event is a transaction, timestamped, signed, and irrevocable:

```
  Block 1000:  CitadelCreated(roomId=0xabc, creator=0xAlice, gate=NFT-X)
                 │
  Block 1042:  CitadelUpdated(roomId=0xabc, field="metadataURI", new="ipfs://Qm...")
                 │
  Block 5830:  [Server dies — no on-chain event, the chain doesn't know or care]
                 │
  Block 5901:  CitadelResurrected(roomId=0xabc, newHint="wss://new-server:2208")
                 │
  Block 8200:  CitadelUpdated(roomId=0xabc, field="metadataURI", new="ipfs://Qn...")
                 │
  Block 12000: [Second server dies — again, the chain doesn't care]
                 │
  Block 12050: CitadelResurrected(roomId=0xabc, newHint="wss://third-server:2208")
                 │
                 ▼
              ... the room continues. Servers come and go.
              The thread on-chain is unbroken.
```

This thread is the room's **provenance** — an auditable history of its existence. Anyone can trace back to the creation event to verify: who started this room? What were the original rules? When was it resurrected? How many servers has it survived?

The thread cannot be forged (transactions require wallet signatures), cannot be deleted (blockchain immutability), and cannot be censored (distributed consensus). It is the immutable backbone of a room that exists in mutable infrastructure.

### How Restoration Works

When a server hosting a Citadel goes offline, the room enters a **dormant** state. It is not dead — it is sleeping. The identity layer still has every fact needed to rebuild it.

**Step 1: Discovery of dormant Citadel**

Anyone querying the registry sees the room. The `transportHint` points to the dead server. A liveness check fails. The UI shows the room as dormant (gray dot instead of green).

**Step 2: Authorization check**

Only the creator (or a wallet listed as admin in the metadata) can resurrect a Citadel. This prevents hijacking — a random wallet cannot claim ownership of someone else's room just because the server went down.

Authorization is verified by wallet signature. The operator signs a resurrection request. The contract verifies the signature matches the creator address stored on-chain.

**Step 3: Metadata recovery**

The resurrector fetches the room configuration from the `metadataURI` (IPFS or Arweave). Because the URI is content-addressed, the content is guaranteed to be the same as when the creator published it. The creator's wallet signature over the metadata JSON provides a second verification layer — even if IPFS returned tampered content, the signature check would fail.

The metadata contains everything needed to rebuild the room: permissions, roles, throttle settings, encryption scheme, token gate details, participant limits.

**Step 4: Room rebuilding**

A new blocktalk node creates a room with the **exact same configuration** from the recovered metadata:
- Same `roomId` (from on-chain record)
- Same token gate (from on-chain record)
- Same permissions, throttle, encryption (from metadata)
- New WebSocket endpoint (the new server's address)

The room is now live again. It is the same room — same identity, same rules, same gate — on new infrastructure.

**Step 5: Transport hint update**

The resurrector submits an on-chain transaction updating the `transportHint` to the new server's endpoint. This transaction emits a `CitadelResurrected` event. Participants who are watching the chain (event listeners, periodic polling) discover the new endpoint automatically.

For XMTP-transport Citadels, a `citadel-resurrect` message is sent to the XMTP group, which XMTP delivers even to participants who were offline during the migration.

**Step 6: Participants reconnect**

Each returning participant:
1. Discovers the new endpoint (from chain event or XMTP message)
2. Connects to the new server via WebSocket
3. Authenticates with wallet signature
4. Passes the token gate check (node queries the chain for their asset balance)
5. Resumes participation in the room

The experience: the room was down for some time, now it's back. Like a website recovering from an outage — the URL (roomId) hasn't changed, only the server behind it.

**Priority resurrection (optional):** Creators can include a tip payment during resurrection for faster indexing, metadata verification, and endpoint caching. The tip is split 10% to the protocol wallet and 90% to the operator (see [Platform Economics](#platform-economics)). Standard resurrection is always free — sovereignty means room recovery is a right, not a privilege.

### Why This Creates Immutable Global Communication

Traditional platforms have a kill switch. A company can shut down a Discord server, delete a Telegram group, ban a Slack workspace. The room's existence depends on the platform's continued willingness to host it.

A Citadel has no kill switch because there is no single entity that controls all three layers:

| Layer | Who Controls It | Can They Kill the Room? |
|-------|----------------|:----------------------:|
| Identity (blockchain) | Distributed consensus (thousands of nodes) | No — immutable by design |
| Metadata (IPFS/Arweave) | Content-addressed storage (replicated globally) | No — content hash is the address |
| Transport (server) | Individual operator | Yes — but the room resurrects elsewhere |

The only way to permanently destroy a Citadel is to:
1. Destroy the blockchain it's registered on (requires 51% attack on the entire network), AND
2. Delete all copies of the metadata from IPFS/Arweave (requires deleting it from every node globally), AND
3. Prevent any authorized wallet from ever starting a new server (requires physical coercion of key holders)

This is, for practical purposes, impossible. The room is immortal in the same way that a Bitcoin transaction is irreversible — not because no one *could* undo it, but because the cost of doing so exceeds the value of any individual room.

### Message Permanence vs Room Permanence

A Citadel guarantees **room permanence** — the room's identity, rules, and access policy are immutable. It does not automatically guarantee **message permanence** — the conversation history depends on the transport:

| Transport | Messages Survive Resurrection? | How |
|-----------|:------------------------------:|-----|
| XMTP | **Yes** | XMTP network stores messages independently of any server |
| Self-hosted + IPFS backup | **Yes** | Periodic export of signed message log to IPFS; CID stored in metadata |
| Self-hosted + XMTP mirror | **Yes** | Dual-write: local for speed, XMTP for permanence |
| Self-hosted + pmVPN SFTP backup | **Partially** | Backup to a second pmVPN server; survives one failure, not two |
| Self-hosted (no backup) | **No** | Messages live only on the host; lost when server dies |

For Citadels that require full immutable communication (governance records, legal discussions, research archives), the recommended configuration is **XMTP transport** or **self-hosted + IPFS backup**. For casual communication where room permanence matters but message history doesn't, self-hosted without backup is sufficient.

### The Analogy: Building vs Blueprint

Think of a Citadel like a building with an indestructible blueprint:

- The **blueprint** (on-chain registry + IPFS metadata) contains every specification: floor plan, access control, fire code, capacity limits. It is filed in a vault that no one can destroy.
- The **building** (self-hosted node or XMTP group) is the physical structure where people meet. It can burn down.
- **Resurrection** is rebuilding the structure from the blueprint. Same blueprint, same building. Different bricks.

Traditional platforms are buildings without blueprints. When the building burns, everything is lost. A Citadel separates the blueprint from the building, making the building replaceable while the identity persists forever.

---

## Why Citadel

The name comes from the cypherpunk tradition. A citadel is a fortress within a city — a permanent, defensible structure protected not by walls but by design. In the blocktalk context:

- **Permanent** — the room's identity is on-chain, immutable, outlives any single server
- **Defensible** — access is enforced by cryptographic proof of asset ownership, not by a gatekeeper
- **Sovereign** — the creator controls the room via wallet ownership, no platform can delete it
- **Recoverable** — if the server falls, the citadel can be rebuilt from on-chain state

The existing room names form a progression: *Private Room* (intimate) → *Boardroom* (professional) → *Dojo* (collaborative) → *Citadel* (permanent, sovereign).

---

## On-Chain Registry Design

### Principle: Identity On-Chain, Content Off-Chain

The blockchain stores the room's **identity and access rules**. Messages, files, and conversation history never touch the chain. The chain is a registry, not a database.

```
  ┌─────────────────────────────────────────────────┐
  │                 On-Chain Registry                 │
  │                                                   │
  │  roomId ──────── bytes32 (unique identifier)     │
  │  creator ─────── address (wallet that paid fee)  │
  │  gateType ────── uint8 (NFT, SFT, fungible, ..) │
  │  gateAsset ───── address/uint64 (token contract) │
  │  gateThreshold ─ uint256 (min balance required)  │
  │  metadataURI ─── string (IPFS/Arweave pointer)   │
  │  transportHint ─ string (last-known endpoint)    │
  │  createdAt ───── uint64 (block timestamp)        │
  │  active ──────── bool (owner can deactivate)     │
  │                                                   │
  │  Events:                                          │
  │    CitadelCreated(roomId, creator, gateAsset)    │
  │    CitadelUpdated(roomId, field, newValue)        │
  │    CitadelResurrected(roomId, newTransportHint)  │
  │    CitadelDeactivated(roomId)                    │
  └─────────────────────────────────────────────────┘
            │
            │ metadataURI points to
            ▼
  ┌─────────────────────────────────────────────────┐
  │           Off-Chain Metadata (IPFS)              │
  │                                                   │
  │  name ─────────── "Cypherpunk Citadel"           │
  │  description ──── "Discussion for holders..."    │
  │  permissions ──── RoomPermissions (full policy)  │
  │  throttle ─────── ThrottleConfig (rate limits)   │
  │  encryption ───── "chacha20" | "mls"             │
  │  agentsAllowed ── true/false                     │
  │  maxParticipants  256                            │
  │  tags ─────────── ["defi", "governance", ...]    │
  │  signature ────── creator's wallet signature     │
  │                                                   │
  │  Signed by creator → verifiable without trust    │
  └─────────────────────────────────────────────────┘
            │
            │ never on-chain
            ▼
  ┌─────────────────────────────────────────────────┐
  │       Content (Self-Hosted / XMTP)               │
  │                                                   │
  │  Messages ─── wallet-signed, encrypted           │
  │  Files ────── sandboxed shared folder            │
  │  History ──── XMTP stores or IPFS backup         │
  │  Participants  in-memory session state           │
  └─────────────────────────────────────────────────┘
```

### On-Chain Record

```typescript
interface CitadelRecord {
  /** Unique room identifier: keccak256(creator, timestamp, nonce) */
  roomId: string;

  /** Wallet address that created and owns the Citadel */
  creator: string;

  /** Which chain this record lives on */
  chain: {
    type: 'evm' | 'algorand';
    chainId: number;            // EVM chain ID or 0 for Algorand
    registryAddress: string;    // Contract address or app ID
  };

  /** Token gate configuration */
  gate: TokenGate;

  /** IPFS/Arweave URI containing signed CitadelMetadata JSON */
  metadataURI: string;

  /** Last-known network endpoint for the room's host node */
  transportHint: string;

  /** Block timestamp of creation */
  createdAt: number;

  /** Whether the room is active (owner can deactivate, not delete) */
  active: boolean;

  /** On-chain transaction hash of creation (for audit) */
  creationTxHash: string;
}
```

### Off-Chain Metadata

```typescript
interface CitadelMetadata {
  /** Human-readable room name */
  name: string;

  /** Purpose, topic, or description */
  description: string;

  /** Room avatar/icon (IPFS hash) */
  avatar?: string;

  /** Full permission policy (reuses blocktalk RoomPermissions) */
  permissions: RoomPermissions;

  /** Throttle configuration */
  throttle: ThrottleConfig;

  /** Transport mode for this room */
  transport: 'self-hosted' | 'xmtp' | 'direct';

  /** Encryption scheme */
  encryption: 'chacha20' | 'mls';

  /** Whether AI agents can participate */
  agentsAllowed: boolean;

  /** Maximum simultaneous participants */
  maxParticipants: number;

  /** Discoverable category tags */
  tags: string[];

  /** Creator's wallet signature over canonical JSON (verification without trust) */
  signature: string;
}
```

The creator signs the metadata JSON using [EIP-191](https://eips.ethereum.org/EIPS/eip-191) `personal_sign`. Any node can verify the metadata was authored by the creator without trusting the IPFS gateway.

### Algorand Implementation

On [Algorand](https://algorand.co/), the Citadel registry is an [ARC-4](https://arc.algorand.foundation/ARCs/arc-0004) smart contract using [box storage](https://developer.algorand.org/docs/get-details/dapps/smart-contracts/apps/state/#box-storage):

- Each Citadel is a box keyed by `roomId` (32 bytes)
- Box value contains ABI-encoded registry fields
- Global state: `total_rooms`, `creation_fee`, `protocol_wallet`, `operator_wallet`, `protocol_bps`
- Deployment via [vibekit-mcp](https://github.com/algorandfoundation/vibekit) `app_deploy`
- Room queries via `read_box` and `indexer_search_transactions`
- Token gate verification via `get_account_info` (checks ASA holdings)

Contract interface is in the [Platform Economics](#platform-economics) section (includes fee-splitting logic).

### EVM Implementation

On EVM chains ([Ethereum](https://ethereum.org/), [Base](https://base.org/), [Polygon](https://polygon.technology/), [Arbitrum](https://arbitrum.io/)), the registry is a Solidity contract with on-chain fee splitting between the blocktalk protocol wallet and the node operator.

Contract interface is in the [Platform Economics](#platform-economics) section (includes fee-splitting logic).

Discovery uses [Blockscout](https://www.blockscout.com/) MCP `get_transactions_by_address` filtered by `CitadelCreated` event topics, or `direct_api_call` for log queries.

### Chain Abstraction Layer

A unified interface abstracts over both implementations:

```typescript
interface ChainRegistry {
  /** Register a new Citadel on-chain. Returns roomId and tx hash. */
  registerCitadel(params: CitadelRegistration): Promise<{ roomId: string; txHash: string }>;

  /** Look up a Citadel by its on-chain ID. */
  lookupCitadel(roomId: string): Promise<CitadelRecord | null>;

  /** Discover Citadels matching filter criteria. */
  discoverCitadels(filter: DiscoveryFilter): Promise<CitadelRecord[]>;

  /** Verify whether a wallet holds the required gate asset. */
  verifyCitadelAccess(roomId: string, wallet: string): Promise<boolean>;

  /** Update the transport hint (resurrection or migration). */
  updateTransportHint(roomId: string, hint: string, signature: string): Promise<{ txHash: string }>;

  /** Deactivate a Citadel (only creator). */
  deactivateCitadel(roomId: string, signature: string): Promise<{ txHash: string }>;
}
```

Two implementations: `AlgorandRegistry` (using [vibekit-mcp](https://github.com/algorandfoundation/vibekit) tools) and `EVMRegistry` (using [viem](https://viem.sh/) for writes, [Blockscout](https://www.blockscout.com/) MCP for reads).

---

## Token-Gating Model

### Gate Types

| Gate Type | ID | EVM Asset | Algorand Asset | Access Rule |
|-----------|:--:|-----------|---------------|-------------|
| **Allowlist** | 0 | N/A | N/A | Wallet in explicit list (metadata-signed) |
| **NFT Collection** | 1 | [ERC-721](https://eips.ethereum.org/EIPS/eip-721) | [ASA](https://developer.algorand.org/docs/get-details/asa/) (total=1, decimals=0) | Hold any token from the collection |
| **NFT Specific** | 2 | [ERC-721](https://eips.ethereum.org/EIPS/eip-721) tokenId | ASA ID (specific) | Hold a specific token ID |
| **SFT Threshold** | 3 | [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155) | ASA (fractional) | Hold >= N of a specific semi-fungible |
| **Fungible Threshold** | 4 | [ERC-20](https://eips.ethereum.org/EIPS/eip-20) | ASA (fungible) | Hold >= N tokens |

### Token Gate Interface

```typescript
interface TokenGate {
  /** Gate type (see table above) */
  gateType: 0 | 1 | 2 | 3 | 4;

  /** Chain where the gate asset lives (can differ from registry chain) */
  chainType: 'evm' | 'algorand';
  chainId: number;

  /** Token contract address (EVM) or ASA ID (Algorand) */
  assetAddress: string;

  /** Minimum balance required (1 for NFT, N for fungible/SFT) */
  threshold: bigint;

  /** Specific token ID (for gate type 2 — NFT Specific) */
  tokenId?: string;
}
```

### Cross-Chain Gates

A Citadel's registry record and its token gate can live on different chains. Example: room registered on Algorand (cheap storage), access gated by an Ethereum ERC-721 NFT.

```
  Citadel Registry (Algorand)
    roomId: 0xabc...
    gateType: 1 (NFT Collection)
    gateAsset: "0x1234...5678"  ← this is an Ethereum contract address
    gateChainId: 1              ← Ethereum mainnet

  Verification:
    1. Read gate config from Algorand registry (vibekit read_box)
    2. Query Ethereum for wallet's NFT balance (Blockscout get_tokens_by_address)
    3. Grant or deny access based on balance >= threshold
```

This works because gate verification happens at the node level, not on-chain. The node reads the gate config and queries the appropriate chain.

### Verification Flow

```
  Wallet requests to join Citadel
         │
         ▼
  Read CitadelRecord from on-chain registry
         │
         ▼
  ┌──── gateType? ────────────────────────────────────┐
  │                                                     │
  │  ALLOWLIST (0)         TOKEN-GATED (1-4)           │
  │  ─────────────         ────────────────            │
  │  Fetch metadata        Query gate asset's chain   │
  │  from metadataURI      (may differ from registry  │
  │  Verify creator sig     chain — cross-chain OK)   │
  │  Check wallet in       ┌─────────────────────────┐ │
  │  allowedWallets list   │ EVM gate asset:         │ │
  │         │              │   Blockscout            │ │
  │         ▼              │   get_tokens_by_address │ │
  │  In list? ──→ Access   │   nft_tokens_by_address │ │
  │  Not in list → Deny    │                         │ │
  │                        │ Algorand gate asset:    │ │
  │                        │   vibekit               │ │
  │                        │   get_account_info      │ │
  │                        │   get_asset_info        │ │
  │                        └──────────┬──────────────┘ │
  │                                   ▼                │
  │                        balance >= threshold?       │
  │                        Yes → Access granted        │
  │                        No  → Access denied         │
  └────────────────────────────────────────────────────┘
```

### Revalidation

Token gates are checked at three points:

| Timing | Trigger | Behavior |
|--------|---------|----------|
| **Join** | Wallet connects to room | Must hold asset to enter |
| **Periodic** | Configurable interval (default: 15 minutes) | Re-query balance; graceful removal if asset transferred |
| **On-demand** | Admin triggers sweep | Immediate revalidation of all participants |

**Graceful removal:** A wallet that was valid at join time but loses the token is notified before removal. They receive a `system` message: "Your access credential is no longer valid. You will be disconnected in 60 seconds." This prevents mid-message disruption and gives time to transfer the asset back.

---

## Platform Economics

### The Principle: Fees for Service, Not Access

blocktalk charges fees for **on-chain services** — registration, storage, indexing, metadata pinning. It does not charge for **communication** — sending messages, joining rooms, or participating in conversations. You pay for the infrastructure that makes permanence possible, not for the right to speak.

### Design Principles

- **Sybil resistance** — fees prevent spam room creation on the public registry
- **Sovereignty** — fee recipients are transparent and configurable; anyone can deploy their own registry with 0% protocol fee
- **Native denomination** — fees in the chain's native asset (ETH, ALGO) — no token approvals needed
- **Configurable** — fee amount and split ratios set at deployment, updatable by contract admin
- **Atomic splitting** — fees split on-chain in a single transaction between protocol and operator

### Free Citadels (Self-Registry)

For environments where on-chain fees are undesirable (testnets, local development, air-gapped networks), a **self-registry** mode stores Citadel records locally on the node filesystem using the same `CitadelRecord` format. The room behaves identically but without on-chain permanence. This is a graceful degradation — not a separate code path.

This distinction is what separates a platform fee from rent-seeking. The Citadel registry contract is MIT-licensed. Anyone can deploy their own registry with 0% protocol fee. The room format is open. If blocktalk's fees are too high, fork the contract and set your own. Sovereignty means the exit door is always open.

### Fee-Split Architecture

Every fee-bearing action splits the payment between three recipients, on-chain, in a single atomic transaction:

```
  Creator pays creation fee (e.g., 1 ALGO / 0.01 ETH)
         │
         ▼
  ┌──────────────────────────────────────────────────┐
  │            Registry Contract                      │
  │                                                    │
  │  Fee split (configured at deployment):            │
  │                                                    │
  │  ┌─────────────────────────────────────────────┐  │
  │  │  Protocol fee (default: 20%)                │  │
  │  │  → blocktalk project wallet                 │  │
  │  │    (published multisig / DAO address)        │  │
  │  │    Funds: development, audits, infra         │  │
  │  └─────────────────────────────────────────────┘  │
  │                                                    │
  │  ┌─────────────────────────────────────────────┐  │
  │  │  Operator fee (default: 80%)                │  │
  │  │  → node operator wallet                     │  │
  │  │    (set by deployer at initialization)      │  │
  │  │    Reward: hosting, indexing, availability   │  │
  │  └─────────────────────────────────────────────┘  │
  │                                                    │
  │  ┌─────────────────────────────────────────────┐  │
  │  │  Burn (optional, default: 0%)               │  │
  │  │  → zero address                             │  │
  │  │    Deflationary mechanism (if desired)       │  │
  │  └─────────────────────────────────────────────┘  │
  │                                                    │
  │  Protocol + Operator + Burn = 100%                │
  └──────────────────────────────────────────────────┘
```

### Expanded Fee Schedule

| Action | Fee | Protocol (20%) | Operator (80%) | Rationale |
|--------|-----|:--------------:|:--------------:|-----------|
| **Create Citadel** | Full creation fee | Yes | Yes | Primary revenue event — Sybil resistance + registry storage |
| **Resurrect (standard)** | Free | — | — | Sovereignty: room recovery is a right, not a privilege |
| **Resurrect (priority)** | Optional tip (creator sets amount) | 10% | 90% | Opt-in: faster indexing, metadata verification, endpoint caching |
| **Reactivate** | 50% of creation fee | Yes | Yes | Deterrent against deactivate/reactivate cycling |
| **IPFS pinning service** | Per-pin fee | 30% | 70% | Value-add: persistent metadata availability |
| **Message history backup** | Per-backup fee | 30% | 70% | Value-add: IPFS archival of room history |
| **Update metadata URI** | Gas/txn fee only | — | — | Should be cheap — content changes, not registration |
| **Update transport hint** | Gas/txn fee only | — | — | Resurrection pathway — must remain free |
| **Deactivate** | Gas/txn fee only | — | — | Cleanup should never be penalized |

### The blocktalk Project Wallet

The protocol fee recipient is a **published, auditable wallet address** set at contract deployment:

**Recommended: Multisig or DAO**

A multisig wallet (e.g., [Safe](https://safe.global/) on EVM, multisig on Algorand) controlled by the blocktalk project maintainers. The address is:

- **Published** — in the contract source, in this documentation, in the README
- **Auditable** — anyone can query the balance and transaction history on-chain
- **Non-custodial** — requires multiple signatures for withdrawals (e.g., 2-of-3)
- **Transparent** — all incoming fees visible via [Blockscout](https://www.blockscout.com/) or [Algorand indexer](https://developer.algorand.org/docs/get-details/indexer/)

**What the protocol wallet funds:**

| Category | Purpose |
|----------|---------|
| Development | Ongoing blocktalk/pmVPN/crypto-ssh development |
| Security audits | Third-party contract and protocol audits |
| Infrastructure | IPFS pinning, indexer nodes, testnet faucets |
| Documentation | Technical writing, tutorials, reference implementations |
| Grants | Community contributions, integrations, tooling |

**Alternative: Deterministic derivation**

For single-operator deployments, the protocol wallet can be derived from a project-level Ed25519 key using the [crypto-ssh](CRYPTO-SSH.md) `deriveServiceWallet()` pattern:

```typescript
import { deriveServiceWallet } from '@pmvpn/crypto-ssh';

// Project-level key (published, version-controlled)
const projectWallet = deriveServiceWallet(projectKeyPEM);
// Same key → same address across all deployments
```

This is simpler but less sovereign than a multisig — it relies on a single key rather than multi-party governance.

### Node Operator Revenue Model

Operators earn 80% of all fees generated on their registry deployment. This creates a sustainable incentive to host Citadel infrastructure:

```
  Operator deploys CitadelRegistry contract
         │
         ▼
  Sets operatorWallet = their own address
  Sets protocolWallet = blocktalk project address (published)
  Sets protocolBps = 2000 (20% = 2000 basis points)
         │
         ▼
  Users create Citadels → fees split automatically
  Operator earns 80% of every creation
         │
         ▼
  Operator revenue scales with usage:
    10 Citadels/month × 1 ALGO fee = 8 ALGO/month to operator
    100 Citadels/month × 1 ALGO fee = 80 ALGO/month to operator
    Premium services (pinning, backup) add additional revenue
```

**Multiple operators, multiple registries:** Different operators can deploy their own registry contracts on the same chain. Each registry has its own fee settings. Users choose which registry to use. Competition keeps fees fair. The protocol fee (to blocktalk) is the constant.

### Updated Smart Contract Interfaces

**Algorand (PuyaTs) — with fee splitting:**

```typescript
class CitadelRegistry extends Contract {
  // Global state
  totalRooms = GlobalState<uint64>({ initialValue: 0 });
  creationFee = GlobalState<uint64>({ initialValue: 1_000_000 });  // 1 ALGO
  protocolWallet = GlobalState<Address>();     // blocktalk project wallet
  operatorWallet = GlobalState<Address>();     // node operator wallet
  protocolBps = GlobalState<uint64>({ initialValue: 2000 }); // 20% in basis points

  @abimethod()
  createCitadel(
    gateType: uint8,
    gateAssetId: uint64,
    gateThreshold: uint64,
    metadataURI: string,
    transportHint: string,
  ): bytes32 {
    // 1. Verify payment >= creationFee
    // 2. Calculate split:
    //    protocolAmount = (payment * protocolBps) / 10000
    //    operatorAmount = payment - protocolAmount
    // 3. Inner transaction: pay protocolWallet protocolAmount
    // 4. Inner transaction: pay operatorWallet operatorAmount
    // 5. Generate roomId, store record, emit log
    // 6. Return roomId
  }

  @abimethod()
  reactivate(roomId: bytes32): void {
    // 1. Verify room is deactivated
    // 2. Verify payment >= creationFee / 2
    // 3. Split payment same as creation
    // 4. Set active = true
    // 5. Emit CitadelReactivated log
  }

  @abimethod()
  resurrectPriority(roomId: bytes32, newHint: string): void {
    // 1. Verify caller is creator or admin
    // 2. Optional: accept tip payment
    // 3. If payment > 0: split (10% protocol, 90% operator)
    // 4. Update transportHint
    // 5. Emit CitadelResurrected log with priority flag
  }
}
```

**EVM (Solidity) — with fee splitting:**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CitadelRegistry {
    // ... existing CitadelRecord struct ...

    address public protocolWallet;    // blocktalk project wallet
    address public operatorWallet;    // node operator wallet
    uint256 public protocolBps;       // basis points (e.g., 2000 = 20%)
    uint256 public creationFee;
    uint256 public totalRooms;

    event FeeSplit(
        bytes32 indexed roomId,
        uint256 protocolAmount,
        uint256 operatorAmount,
        string action
    );

    function createCitadel(
        uint8 gateType,
        address gateAsset,
        uint256 gateThreshold,
        string calldata metadataURI,
        string calldata transportHint
    ) external payable returns (bytes32 roomId) {
        require(msg.value >= creationFee, "Insufficient fee");

        // Fee split
        uint256 protocolAmount = (msg.value * protocolBps) / 10000;
        uint256 operatorAmount = msg.value - protocolAmount;

        payable(protocolWallet).transfer(protocolAmount);
        payable(operatorWallet).transfer(operatorAmount);

        // Room creation
        roomId = keccak256(abi.encode(msg.sender, block.timestamp, totalRooms));
        citadels[roomId] = CitadelRecord({ /* ... */ });
        totalRooms++;

        emit CitadelCreated(roomId, msg.sender, gateAsset);
        emit FeeSplit(roomId, protocolAmount, operatorAmount, "create");
    }

    function reactivate(bytes32 roomId) external payable {
        require(citadels[roomId].creator == msg.sender, "Not creator");
        require(!citadels[roomId].active, "Already active");
        require(msg.value >= creationFee / 2, "Insufficient reactivation fee");

        uint256 protocolAmount = (msg.value * protocolBps) / 10000;
        uint256 operatorAmount = msg.value - protocolAmount;

        payable(protocolWallet).transfer(protocolAmount);
        payable(operatorWallet).transfer(operatorAmount);

        citadels[roomId].active = true;
        emit FeeSplit(roomId, protocolAmount, operatorAmount, "reactivate");
    }

    function resurrectPriority(bytes32 roomId, string calldata hint) external payable {
        require(citadels[roomId].creator == msg.sender, "Not creator");
        citadels[roomId].transportHint = hint;

        if (msg.value > 0) {
            // Priority tip: 10% protocol, 90% operator
            uint256 protocolAmount = (msg.value * 1000) / 10000; // 10%
            uint256 operatorAmount = msg.value - protocolAmount;
            payable(protocolWallet).transfer(protocolAmount);
            payable(operatorWallet).transfer(operatorAmount);
            emit FeeSplit(roomId, protocolAmount, operatorAmount, "resurrect-priority");
        }

        emit CitadelResurrected(roomId, hint);
    }
}
```

### Cypherpunk2048 Fee Compliance

| Principle | How the Fee Model Respects It |
|-----------|-------------------------------|
| **Sovereignty** | Fees are for on-chain registration, not communication. You never pay to speak. Self-registry mode is free. Deploy your own contract with 0% protocol fee at any time. |
| **Permissionless** | Any wallet pays the fee, gets a Citadel. No approval. No KYC. No identity verification. The fee is the only requirement. |
| **Transparency** | Every fee, split ratio, and recipient is on-chain. The `FeeSplit` event logs every payment. Anyone can audit. |
| **No lock-in** | The contract is MIT-licensed. The room format is open. Fork the registry, set your own fees, operate your own economy. The exit door is always open. |
| **Minimal trust** | Fee splitting is atomic and on-chain. No off-chain invoicing. No payment processor. No intermediary. |
| **Consent** | All fees are visible before the transaction. The creator chooses to pay. No hidden charges. No recurring fees. |
| **Operator sovereignty** | Each operator sets their own fee amount when deploying. Protocol percentage is a constant the operator agrees to at deployment time. |

### The Self-Sovereignty Escape Hatch

This is the most important part of the fee model: **you can always leave.**

If you disagree with blocktalk's protocol fee:
1. Deploy your own `CitadelRegistry` contract (MIT license, source is public)
2. Set `protocolBps = 0` and `protocolWallet = address(0)`
3. All fees go to your operator wallet
4. Rooms created on your registry are fully functional Citadels
5. They use the same format, same token gates, same resurrection protocol

blocktalk earns its fee by providing value: maintained contracts, audited code, indexed discovery, IPFS pinning, documentation, ecosystem development. If that value isn't worth 20% of a nominal creation fee, the market will decide.

This is the cypherpunk social contract: **earn your fee by being useful, not by being unavoidable.**

---

## Room Discovery

### On-Chain Discovery (Primary)

**EVM:** Query `CitadelCreated` events via [Blockscout](https://www.blockscout.com/) MCP:
- `get_transactions_by_address` filtered by registry contract
- `direct_api_call` for log filtering by event topic
- Parse event data to extract room records

**Algorand:** Query via [vibekit-mcp](https://github.com/algorandfoundation/vibekit):
- `indexer_search_transactions` filtered by registry app ID
- `read_box` to enumerate room records by key prefix
- `indexer_lookup_application_logs` for creation events

### Gossip Discovery (Supplementary)

Nodes can announce known Citadels via a new blocktalk message type:

```typescript
// Sent as a blocktalk message (type: 'citadel-announce')
interface CitadelAnnouncement {
  roomId: string;
  chain: { type: 'evm' | 'algorand'; chainId: number };
  registryAddress: string;
  name: string;              // From metadata
  gateAsset: string;
  transportHint: string;     // Current live endpoint
  signature: string;         // Announcer's wallet signature
}
```

Gossip supplements on-chain discovery for nodes that don't want to poll the chain. It is not authoritative — the chain is always the source of truth.

### Discovery Filter

```typescript
interface DiscoveryFilter {
  /** Filter by creator wallet */
  creator?: string;

  /** Find rooms gated by a specific token */
  gateAsset?: string;

  /** Match metadata tags */
  tags?: string[];

  /** Filter by chain */
  chain?: 'evm' | 'algorand';
  chainId?: number;

  /** Only active rooms */
  active?: boolean;

  /** Created after timestamp */
  createdAfter?: number;

  /** Created before timestamp */
  createdBefore?: number;
}
```

### User Discovery Flow

```
  User opens blocktalk client
       │
       ▼
  "Discover Citadels" panel
       │
       ├── Enter filter criteria (optional)
       │   - By token I hold
       │   - By tag/category
       │   - By creator
       │
       ▼
  Query chain registry (Algorand or EVM)
       │
       ▼
  For each result:
       ├── Fetch metadataURI → room name, description, tags
       ├── Check token gate: do I hold the required asset?
       └── Show status: ● live (transportHint reachable)
                        ○ dormant (no active host)
                        ✕ gated (I don't hold the token)
       │
       ▼
  User clicks a live, accessible Citadel
       │
       ▼
  Connect to transportHint endpoint
  Authenticate with wallet signature
  Token gate verified by node
  Join room
```

**Stale room handling:** Citadels that remain dormant indefinitely are not cleaned up — on-chain records are permanent by design. Client-side discovery can filter by `createdAfter` or hide rooms dormant beyond a configurable threshold (e.g., 90 days). The chain stores everything; the UI curates what you see.

---

## Room Resurrection

The defining feature of a Citadel: it survives server death. The full six-step restoration flow, three-layer architecture, and immutability thread are documented in [How Permanence Works](#how-permanence-works) above.

### Summary

1. Citadel record persists on-chain after server death (immutable)
2. Authorized wallet reads record + metadata from chain + IPFS
3. New server rebuilds room with identical configuration
4. Transport hint updated on-chain → participants rediscover and reconnect

**Priority resurrection** (opt-in, see [Platform Economics](#platform-economics)): creators can include a tip for faster indexing, metadata verification, and endpoint caching. Standard resurrection is always free.

### What Survives vs What Is Lost

| Aspect | Survives | Notes |
|--------|:--------:|-------|
| Room identity (roomId) | Yes | On-chain, immutable |
| Permission policy | Yes | metadataURI, creator-signed |
| Token gate config | Yes | On-chain |
| Creator identity | Yes | On-chain |
| Room name/description | Yes | metadataURI |
| Message history (XMTP) | Yes | XMTP network stores messages |
| Message history (self-hosted) | No | Unless backed up to IPFS |
| Shared files | No | Were on dead server's filesystem |
| Active connections | No | Must reconnect |

### Message Preservation Strategies

For Citadels that need message survival:

1. **XMTP transport** — messages survive inherently (XMTP network persists them)
2. **Self-hosted + IPFS backup** — periodically export signed message log to IPFS, store CID in metadata
3. **Self-hosted + XMTP mirror** — dual-write to both transports: self-hosted for low-latency, XMTP for persistence
4. **Self-hosted + pmVPN SFTP** — back up room state to a different pmVPN server via SFTP (port +1); survives single-server failure

---

## Encryption

Citadels use the same encryption as other blocktalk room types. The transport determines the scheme:

| Transport | Encryption | Forward Secrecy | Standard |
|-----------|-----------|:---------------:|----------|
| Self-hosted | [X25519](https://cr.yp.to/ecdh.html) ECDH + [ChaCha20-Poly1305](https://cr.yp.to/chacha.html) | No | [RFC 7748](https://www.rfc-editor.org/rfc/rfc7748), [RFC 8439](https://www.rfc-editor.org/rfc/rfc8439) |
| XMTP | [MLS](https://www.rfc-editor.org/rfc/rfc9420) (ChaCha20-Poly1305 + Ed25519) | Yes | [RFC 9420](https://www.rfc-editor.org/rfc/rfc9420) |
| Direct | None (signature-only) | N/A | [EIP-191](https://eips.ethereum.org/EIPS/eip-191) |

On-chain data (registry record, metadata hash) is public. Room **content** is always encrypted on the transport layer. The chain knows a room exists and who can access it, but not what is said inside.

---

## Cypherpunk2048 Compliance

| Principle | Citadel Implementation |
|-----------|------------------------|
| **Keys are identity** | Room creator = wallet that signed the creation tx. Token gate = cryptographic proof of asset ownership. No usernames, no emails, no KYC. |
| **Verification replaces trust** | Token gate verified on-chain (balance query). Metadata verified by creator signature ([EIP-191](https://eips.ethereum.org/EIPS/eip-191)). Messages verified by wallet signature (existing [blocktalk](BLOCKTALK.md) pattern). |
| **Sovereignty** | Creator controls the room via on-chain ownership. No platform can delete a Citadel — the record is immutable. Any server can resurrect it. The room outlives its infrastructure. Self-sovereignty escape hatch: deploy your own registry with 0% protocol fee. |
| **Privacy** | On-chain: only roomId, creator, and gate config are public. Content is never on-chain. Metadata can use encrypted IPFS. Transport layer is end-to-end encrypted. |
| **Permissionless** | Any wallet can create a Citadel by paying the fee. No approval process. No gatekeeping beyond the Sybil-resistance fee. |
| **Minimal trust** | Chain verification replaces trust in a central operator. IPFS/Arweave for metadata replaces trust in a single server. [MLS](https://www.rfc-editor.org/rfc/rfc9420) math replaces trust in a messaging provider. |
| **Consent** | Token gate is explicit: you chose to hold (or not hold) the asset. Joining is voluntary. Revalidation is transparent with notice. |
| **Throttle as protection** | Same [throttle system](BLOCKTALK.md#throttle-settings) as existing room types. Protects all participants equally. |
| **Fees for service** | Fees fund on-chain registration and infrastructure, not communication. Fee amounts, split ratios, and recipients are all on-chain and auditable. The contract is MIT-licensed — fork it and set your own economics. blocktalk earns its fee by being useful, not by being unavoidable. |

---

## Distributed Social Networking

Citadels are the foundation for sovereign social networking without a platform.

### Rooms as Social Spaces

Every token community already has a social graph: the set of wallets holding that token. A Citadel makes that graph into a communication space. No separate "follow" or "friend" mechanism — token ownership IS membership.

```
  Token community: "CypherPunks DAO" (1000 NFT holders)
         │
         ▼
  Creator mints NFT collection (ERC-721 or ASA)
  Creator registers Citadel gated by this collection
         │
         ▼
  Any of the 1000 holders can discover and join the Citadel
  No invitation needed — the token IS the invitation
  New holders gain access immediately
  Sellers lose access at next revalidation
         │
         ▼
  Multiple Citadels per community:
    "General"      — gated by any NFT from collection
    "Governance"   — gated by holding >= 10 tokens
    "Founders"     — gated by specific token IDs (#1-#50)
    "Research Dojo" — gated by NFT + agents allowed
```

### Identity Portability

Your wallet address is your identity across all Citadels on all chains. The same wallet that:
- Holds your [NFTs](https://eips.ethereum.org/EIPS/eip-721) and [tokens](https://eips.ethereum.org/EIPS/eip-20)
- Signs your [blocktalk](BLOCKTALK.md) messages
- Authenticates to [pmVPN](../README.md) servers
- Derives [SSH keys](CRYPTO-SSH.md) via crypto-ssh

...also proves your membership in any Citadel. One identity. Every context.

### Federation via Chain

Traditional federation protocols (ActivityPub, Matrix) require servers to discover each other and negotiate trust. Citadels federate through the blockchain:

| Federation Aspect | Traditional (ActivityPub) | Citadel |
|-------------------|--------------------------|---------|
| Discovery | WebFinger, DNS | On-chain event query |
| Identity | @user@server.tld | 0xWalletAddress |
| Trust | Server-to-server TLS | Wallet signature verification |
| Membership | Account creation | Token ownership |
| Portability | Export/import (lossy) | Wallet works everywhere (lossless) |
| Censorship resistance | Depends on server operator | On-chain record is immutable |
| Cost model | Server hosting | Chain transaction fees |

### Composability with Existing Ecosystems

Citadels can be gated by **any existing token** — not just purpose-built access passes:

| Existing Asset | Citadel Use Case |
|---------------|-----------------|
| [ENS](https://ens.domains/) domain | Gate by ENS ownership |
| [Bored Ape](https://boredapeyachtclub.com/) NFT | BAYC holder chat |
| [Uniswap](https://uniswap.org/) governance token | UNI governance discussion room |
| Algorand [ASA](https://developer.algorand.org/docs/get-details/asa/) | Any Algorand project community |
| [PARSEC](https://github.com/cypherpunk2048/parsec-wallet) wallet NFT | PARSEC user community |
| [POAP](https://poap.xyz/) attendance token | Event attendee chat |

This means every existing token community can spin up Citadels **without deploying new contracts** — just register a Citadel with the existing token address as the gate asset.

---

## Integration with blocktalk

### Extended Room Config

```typescript
interface RoomConfig {
  transport: 'self-hosted' | 'xmtp' | 'direct';
  type: 'private' | 'boardroom' | 'dojo' | 'citadel';   // ← added

  /** Citadel-specific config (only when type === 'citadel') */
  citadel?: {
    chainType: 'evm' | 'algorand';
    chainId: number;
    registryAddress: string;
    roomId?: string;              // Set after on-chain registration
    tokenGate: TokenGate;
    metadataURI?: string;         // Set after metadata upload
    revalidateInterval: number;   // ms between gate rechecks (default: 900000)
  };
}
```

### Extended Room Permissions

```typescript
interface RoomPermissions {
  // ... existing fields from BLOCKTALK.md ...

  /** Extended join policy */
  joinPolicy: 'invite-only' | 'allowlist' | 'open' | 'token-gated';  // ← added

  /** On-chain room ID (undefined for non-Citadel rooms) */
  chainRoomId?: string;

  /** Whether admins can update the token gate after creation */
  gateUpdateable: boolean;
}
```

### Citadel Default Permissions

| Setting | Default |
|---------|:-------:|
| joinPolicy | token-gated |
| maxParticipants | 256 |
| agentsAllowed | true |
| filesEnabled | true |
| maxFileSize | 50 MB |
| maxRoomStorage | 1 GB |
| membersCanInvite | false (the token is the invite) |
| retention | persistent |
| idleTimeout | 0 (never — permanent) |
| gateUpdateable | false (immutable by default) |

### New Message Types

```typescript
type MessageType =
  // ... existing blocktalk v2 types ...
  | 'citadel-announce'       // Discovery: a Citadel exists at this endpoint
  | 'citadel-gate-check'     // Request: verify my token gate status
  | 'citadel-gate-result'    // Response: gate verification result
  | 'citadel-resurrect'      // System: room resurrected at new endpoint
  | 'citadel-revalidate'     // System: periodic token gate revalidation
```

### XMTP Content Type Mapping

| blocktalk type | XMTP content type |
|----------------|-------------------|
| citadel-announce | `blocktalk.org/citadel-announce:1.0` |
| citadel-gate-check | `blocktalk.org/citadel-gate:1.0` |
| citadel-gate-result | `blocktalk.org/citadel-gate:1.0` (response) |
| citadel-resurrect | `blocktalk.org/citadel-resurrect:1.0` |
| citadel-revalidate | `blocktalk.org/citadel-revalidate:1.0` |

---

## File Structure

```
blocktalk/                              # v2 module
├── src/
│   ├── room.ts                         # MODIFY: add 'citadel' type handling
│   ├── permissions.ts                  # MODIFY: add 'token-gated' joinPolicy
│   ├── message.ts                      # MODIFY: add citadel message types
│   ├── node.ts                         # MODIFY: token gate check at WebSocket auth
│   ├── xmtp.ts                         # MODIFY: add citadel XMTP content types
│   │
│   └── citadel/                        # NEW: Citadel submodule
│       ├── index.ts                    # Citadel module exports
│       ├── types.ts                    # CitadelRecord, TokenGate, CitadelMetadata, etc.
│       ├── registry.ts                 # ChainRegistry interface + factory
│       ├── registry-algorand.ts        # AlgorandRegistry (vibekit-mcp)
│       ├── registry-evm.ts            # EVMRegistry (viem + Blockscout)
│       ├── gate.ts                     # Token gate verification orchestrator
│       ├── gate-evm.ts                # EVM balance/ownership queries
│       ├── gate-algorand.ts           # Algorand ASA balance queries
│       ├── discovery.ts               # Room discovery (on-chain + gossip)
│       ├── resurrection.ts            # Resurrection flow orchestration
│       └── metadata.ts                # Metadata creation, signing, IPFS upload
│
└── contracts/                          # NEW: On-chain registry contracts
    ├── algorand/
    │   └── CitadelRegistry.algo.ts     # Algorand TypeScript (PuyaTs)
    └── evm/
        └── CitadelRegistry.sol         # Solidity (minimal)
```

---

## Security Considerations

| Threat | Mitigation |
|--------|-----------|
| **Spam room creation** | Creation fee (Sybil resistance). Fee adjustable by contract admin. |
| **Token gate bypass** | Verification at node level + periodic revalidation. Node queries chain directly. |
| **Fake metadata** | Creator signs metadata with wallet; any node verifies the signature. |
| **Stale transportHint** | Nodes check endpoint liveness before showing as "live." Dormant status for unreachable rooms. |
| **Registry contract compromise** | Immutable record design — no admin can delete rooms. Deactivation only by creator. |
| **IPFS metadata unavailable** | Room still discoverable on-chain (roomId, gate, creator). Metadata can be re-uploaded to new URI. |
| **Cross-chain oracle manipulation** | Gate verification uses direct chain queries (Blockscout, vibekit), not oracles. |
| **Front-running room creation** | Room ID includes creator address — cannot be front-run by a different wallet. |
| **Metadata URI poisoning** | Signature verification: only metadata signed by the creator is accepted. |
| **AI agent flooding in Citadel** | Same [throttle controls](BLOCKTALK.md#throttle-settings) as dojo: consecutive message limits, cooldowns, budgets. |

---

## References

### Protocol Standards

- [RFC 9420](https://www.rfc-editor.org/rfc/rfc9420) — Messaging Layer Security (MLS)
- [RFC 8439](https://www.rfc-editor.org/rfc/rfc8439) — ChaCha20 and Poly1305
- [RFC 7748](https://www.rfc-editor.org/rfc/rfc7748) — Elliptic Curves for Security (X25519)
- [RFC 5869](https://tools.ietf.org/html/rfc5869) — HKDF

### Ethereum Standards

- [EIP-191](https://eips.ethereum.org/EIPS/eip-191) — Signed Data Standard (personal_sign)
- [ERC-20](https://eips.ethereum.org/EIPS/eip-20) — Token Standard
- [ERC-721](https://eips.ethereum.org/EIPS/eip-721) — Non-Fungible Token Standard
- [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155) — Multi Token Standard

### Algorand Standards

- [ARC-4](https://arc.algorand.foundation/ARCs/arc-0004) — Application Binary Interface
- [ARC-19](https://arc.algorand.foundation/ARCs/arc-0019) — Mutable Asset Metadata (Template)
- [ASA](https://developer.algorand.org/docs/get-details/asa/) — Algorand Standard Assets

### Ecosystem

- [XMTP](https://xmtp.org/) — Decentralized messaging protocol
- [xmtp/xmtp-js](https://github.com/xmtp/xmtp-js) — TypeScript SDKs
- [Blockscout](https://www.blockscout.com/) — Blockchain explorer and API
- [vibekit-mcp](https://github.com/algorandfoundation/vibekit) — Algorand development tools
- [viem](https://viem.sh/) — TypeScript Ethereum library
- [IPFS](https://ipfs.tech/) — InterPlanetary File System

### Heritage

- [blocktalk v1](../../blocktalk/) — Original wallet-to-wallet messaging
- [blocktalk v2](BLOCKTALK.md) — Room architecture and transport modes
- [pmVPN](../README.md) — Wallet-authenticated remote access
- [crypto-ssh](CRYPTO-SSH.md) — Bidirectional key derivation (service wallets)
- [csshd](https://github.com/cryptoAGI/csshd) — First wallet-login SSH server
- [PARSEC Wallet](https://github.com/cypherpunk2048/parsec-wallet) — Sovereign wallet architecture

---

*The room outlives the server. The token is the invitation. The chain is the truth.*

*Professor Codephreak — cypherpunk2048*
