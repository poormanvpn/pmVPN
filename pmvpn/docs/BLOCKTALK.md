# blocktalk v2 — Wallet-Gated Communication Rooms with File Sharing

*Private messaging. Shared folders. Dojo multi-chat. Human and AI. Lightweight and self-hosted.*

---

## Summary

blocktalk v2 extends wallet-to-wallet messaging into a full communication platform. Any wallet can open a **room** — a lightweight, encrypted, permission-controlled space where wallets exchange messages, share files, and collaborate with AI agents. Rooms are ephemeral or persistent, private or invite-only, throttled and sandboxed.

The architecture supports three transport modes:

1. **Self-hosted node** — a lightweight event server any wallet can spin up from the pmVPN client, requiring no external infrastructure
2. **[XMTP](https://xmtp.org/) network** — decentralized relay with [MLS](https://www.rfc-editor.org/rfc/rfc9420) end-to-end encryption, offline delivery, and cross-app interoperability
3. **Direct transport** — the original blocktalk model: signed messages over any channel (clipboard, QR, HTTP)

All three modes use the same wallet signature identity. A message signed in a self-hosted room verifies identically on XMTP. The transport changes; the identity does not.

---

## Heritage

blocktalk v1 ([`/blocktalk/`](../../blocktalk/)) proved the core concept: wallet-signed messages with [viem](https://viem.sh/) verification, transport-agnostic delivery, and [pmVPN share invites](docs/BOOTSTRAP.md) as a message type. 484 lines of TypeScript. No server. No accounts. No encryption (signatures only).

blocktalk v2 preserves everything v1 proved and adds:
- **Rooms** — multi-party spaces with wallet-gated access
- **Encryption** — [MLS (RFC 9420)](https://www.rfc-editor.org/rfc/rfc9420) via XMTP or [ChaCha20-Poly1305](https://cr.yp.to/chacha.html) for self-hosted
- **File sharing** — sandboxed shared folders within rooms
- **AI participants** — Claude, custom agents, and AI-to-AI communication
- **Throttling** — rate limiting, message size limits, bandwidth caps
- **Permission controls** — role-based access following cypherpunk2048 standard

[XMTP](https://github.com/xmtp) provides the decentralized messaging layer. Their [MLS implementation](https://github.com/xmtp/libxmtp) handles forward secrecy, post-compromise security, and group key management — cryptographic properties that would take years to build correctly from scratch.

---

## Room Types

A **room** is a wallet-gated communication space. Every room has an owner (the wallet that created it), a set of participants, and a permission policy.

### Private Room

One-to-one communication. The simplest case.

```
  ┌────────────┐              ┌────────────┐
  │  Wallet A  │ ←── room ──→ │  Wallet B  │
  │  (owner)   │   encrypted  │  (invited) │
  └────────────┘              └────────────┘
```

- Owner creates room, invites one wallet
- Messages encrypted end-to-end
- File sharing: sandboxed folder, both wallets have read/write
- Auto-expires after configurable idle timeout

### Boardroom

Invite-only multi-party room with structured roles.

```
  ┌────────────┐
  │  Wallet A  │ ← admin (creates room, sets policy)
  └─────┬──────┘
        │
  ┌─────┴───────────────────────────────┐
  │            Boardroom                 │
  │  ┌──────┐ ┌──────┐ ┌──────┐        │
  │  │ B    │ │ C    │ │ D    │ members │
  │  │member│ │member│ │viewer│         │
  │  └──────┘ └──────┘ └──────┘        │
  │                                     │
  │  Shared folder: /boardroom/files/   │
  │  Message history: retained          │
  │  AI agents: allowed (by policy)     │
  └─────────────────────────────────────┘
```

- Admin creates room, sets roles, invites by wallet address
- Roles: `admin`, `member`, `viewer` (see [Permission Controls](#permission-controls))
- Shared folder with per-role access levels
- Message history retained for room lifetime
- Suitable for project collaboration, team communication

### Dojo

Open multi-chat room designed for human-AI and AI-AI interaction.

```
  ┌──────────────────────────────────────────────��───┐
  │                     Dojo                          │
  │                                                    │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
  │  │  Human A │  │  Human B │  │  Human C │        │
  │  │  wallet  │  │  wallet  │  │  wallet  │        │
  │  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
  │       │              │              │              │
  │  ─────┴──────────────┴──────────────┴───── chat   │
  │                                                    │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
  │  │ Claude   │  │ Agent X  │  │ Agent Y  │        │
  │  │ (XMTP)  │  │ (XMTP)  │  │ (local)  │        │
  │  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
  │       │              │              │              │
  │  ─────┴──────────────┴──────────────┴───── agents │
  │                                                    │
  │  Shared folder: /dojo/workspace/                  │
  │  File sharing: enabled (with throttle)            │
  │  Participants: humans + AI agents                 │
  │  Mode: collaborative problem-solving              │
  └──────────────────────────────────────────────────┘
```

- Any participant can invite others (if policy allows)
- AI agents are first-class participants with wallet identities
- Multiple AI agents can converse with each other and with humans
- Shared workspace folder for collaborative file editing
- Rate-limited to prevent agent flooding
- Use cases: pair programming, research sessions, brainstorming, code review

---

## Transport Modes

### Mode 1: Self-Hosted Node (Lightweight Event Server)

**The cypherpunk2048 default.** Any wallet can spin up a communication node directly from the pmVPN client. No external infrastructure. No dependency on XMTP network availability. Full sovereignty.

```
  ┌─────────────────────────────────────────────────────┐
  │  pmVPN Client (Wallet A)                             │
  │                                                       │
  │  ┌─────────────────────────────────────────────┐     │
  │  │  blocktalk Node                              │     │
  │  │                                               │     │
  │  │  WebSocket server on port +8 (configurable)  │     │
  │  │  Wallet-authenticated connections             │     │
  │  │  Room state in memory                         │     │
  │  │  Shared folder sandboxed to /tmp/bt-rooms/   │     │
  │  │  Message encryption: ChaCha20-Poly1305       │     │
  │  │  Key exchange: X25519 ECDH per participant    │     │
  │  └─────────────────────────────────────────────┘     │
  │                                                       │
  │  Throttle: 60 msg/min, 5MB/file, 50MB/room total    │
  └───────────────┬─────────────────────────────────────┘
                  │
           WebSocket (wss://)
           Wallet signature auth
                  │
  ┌───────────────┴─────────────────────────────────────┐
  │  External participants                                │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
  │  │ Wallet B │  │ Wallet C │  │ Agent X  │           │
  │  │ browser  │  │ phone    │  │ XMTP bot │           │
  │  └──────────┘  └──────────┘  └──────────┘           │
  └───────────────────────────────────────────────────────┘
```

**How it works:**

1. Wallet A opens pmVPN client, clicks "Open Room"
2. A lightweight WebSocket server starts on a configurable port
3. The room gets a unique ID and an invite link/QR code
4. External wallets connect via WebSocket, authenticate with signature
5. Messages are broadcast to all room participants
6. Files are stored in a sandboxed directory on the host machine
7. When the room owner closes or disconnects, the room ends (ephemeral)
8. Optionally: persist room to disk for resumption

**Properties:**

| Property | Value |
|----------|-------|
| Infrastructure required | None — runs on your machine |
| Network dependency | LAN or internet (any WebSocket route) |
| Encryption | [X25519](https://cr.yp.to/ecdh.html) key exchange + [ChaCha20-Poly1305](https://cr.yp.to/chacha.html) per message |
| Persistence | Ephemeral by default; optional disk persistence |
| Max participants | Configurable (default: 16) |
| File storage | Sandboxed on host filesystem |
| Offline delivery | Not supported (participants must be online) |
| Discovery | Invite link or QR code — no public directory |

**Self-hosted node event protocol:**

```typescript
// Client → Node
interface NodeMessage {
  type: 'auth' | 'chat' | 'file-upload' | 'file-list' | 'file-download'
      | 'room-info' | 'invite' | 'kick' | 'throttle-config';
  room: string;            // room ID
  payload: any;            // type-specific data
  signature: string;       // wallet signature over canonical form
  nonce: string;           // replay protection
}

// Node → Client
interface NodeEvent {
  type: 'message' | 'join' | 'leave' | 'file-added' | 'file-removed'
      | 'room-update' | 'error' | 'throttled';
  room: string;
  from: string;            // wallet address of the event source
  payload: any;
  timestamp: number;
}
```

### Mode 2: XMTP Network (Decentralized Relay)

For production messaging that survives disconnections, spans devices, and interoperates with the broader [XMTP ecosystem](https://xmtp.org/).

```
  ┌──────────┐     ┌──────────┐     ┌──────────┐
  │ Wallet A │     │ Wallet B │     │ Agent X  │
  │ browser  │     │ phone    │     │ node.js  │
  └────┬─────┘     └────┬─────┘     └────┬─────┘
       │                 │                 │
       │    XMTP SDK     │    XMTP SDK     │   Agent SDK
       │                 │                 │
  ┌────┴─────────────────┴─────────────────┴────┐
  │              XMTP Network                    │
  │                                              │
  │  MLS encryption (RFC 9420)                   │
  │  Forward secrecy + post-compromise security  │
  │  Offline delivery and message persistence    │
  │  Group conversations with role management    │
  │  Content type system for files, reactions    │
  │  Decentralized node operators (xmtpd)       │
  └──────────────────────────────────────────────┘
```

**Integration with blocktalk:**

| blocktalk concept | XMTP equivalent |
|-------------------|----------------|
| Room | [XMTP Group Conversation](https://docs.xmtp.org/) |
| Wallet auth | XMTP Inbox ID (wallet-derived) |
| Message signing | MLS message authentication ([Ed25519](https://ed25519.cr.yp.to/)) |
| File sharing | [Remote Attachment](https://github.com/xmtp/xmtp-js) content type |
| AI agent | [XMTP Agent SDK](https://github.com/xmtp/xmtp-js) (`@xmtp/agent-sdk`) |
| Invite | XMTP group invite link |
| Permissions | XMTP group admin/super-admin/member roles |
| Encryption | [MLS_128_HPKEX25519_CHACHA20POLY1305_SHA256_Ed25519](https://www.rfc-editor.org/rfc/rfc9420) |

**XMTP SDKs used:**

| Package | Purpose |
|---------|---------|
| [`@xmtp/browser-sdk`](https://github.com/xmtp/xmtp-js) | Browser client (WASM + Web Workers) |
| [`@xmtp/node-sdk`](https://github.com/xmtp/xmtp-js) | Server-side / CLI client |
| [`@xmtp/agent-sdk`](https://github.com/xmtp/xmtp-js) | AI agent participation |
| [`@xmtp/content-type-remote-attachment`](https://github.com/xmtp/xmtp-js) | File sharing (encrypted off-network storage) |
| [`@xmtp/content-type-reply`](https://github.com/xmtp/xmtp-js) | Threaded conversations |
| [`@xmtp/content-type-reaction`](https://github.com/xmtp/xmtp-js) | Message reactions |

### Mode 3: Direct Transport (blocktalk v1 Compatible)

The original model. No server, no network. Messages are signed and transported manually.

- Clipboard copy/paste
- QR code scan
- pmVPN share invite embedding
- Email or any text channel

Still supported in v2 for environments with no internet access, maximum privacy, or air-gapped operation.

### Transport Selection

```typescript
interface RoomConfig {
  transport: 'self-hosted' | 'xmtp' | 'direct';
  // ... room settings
}
```

The room creator chooses the transport. Participants join using the same transport. A room cannot mix transports (this keeps the security model clean).

**When to use each:**

| Scenario | Recommended Transport |
|----------|-----------------------|
| Quick private chat, same network | Self-hosted node |
| Persistent group, multiple devices | XMTP |
| Air-gapped or offline environment | Direct |
| AI agent collaboration | XMTP (agent SDK) or self-hosted |
| Maximum sovereignty, no third-party | Self-hosted node |
| Cross-app interoperability | XMTP |
| File-heavy collaboration | Self-hosted (local filesystem) |

---

## Permission Controls

Every room enforces a permission policy set by the room owner. Permissions follow the **cypherpunk2048 standard**: cryptographic verification at every boundary, least privilege by default, explicit consent for every escalation.

### Roles

| Role | Create room | Send messages | Upload files | Download files | Invite others | Kick members | Change policy | Delete room |
|------|:-----------:|:------------:|:------------:|:--------------:|:-------------:|:------------:|:-------------:|:-----------:|
| **Owner** | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Admin** | — | Yes | Yes | Yes | Yes | Yes | — | — |
| **Member** | — | Yes | Yes | Yes | — | — | — | — |
| **Viewer** | — | — | — | Yes | — | — | — | — |
| **Agent** | — | Yes | Configurable | Configurable | — | — | — | — |

### Permission Policy

```typescript
interface RoomPermissions {
  /** Who can join: 'invite-only' | 'allowlist' | 'anyone-with-link' */
  joinPolicy: 'invite-only' | 'allowlist' | 'open';

  /** Wallet addresses allowed (for 'allowlist' mode) */
  allowedWallets: string[];

  /** Whether AI agents can participate */
  agentsAllowed: boolean;

  /** Maximum number of participants */
  maxParticipants: number;

  /** Whether file sharing is enabled */
  filesEnabled: boolean;

  /** Per-file size limit (bytes, 0 = unlimited) */
  maxFileSize: number;

  /** Total room storage limit (bytes, 0 = unlimited) */
  maxRoomStorage: number;

  /** Whether members can invite others */
  membersCanInvite: boolean;

  /** Message retention: 'ephemeral' (deleted on disconnect) | 'session' | 'persistent' */
  retention: 'ephemeral' | 'session' | 'persistent';

  /** Auto-expire room after idle period (ms, 0 = never) */
  idleTimeout: number;
}
```

### Default Policies by Room Type

| Setting | Private Room | Boardroom | Dojo |
|---------|:------------:|:---------:|:----:|
| joinPolicy | invite-only | invite-only | open |
| maxParticipants | 2 | 32 | 64 |
| agentsAllowed | false | configurable | true |
| filesEnabled | true | true | true |
| maxFileSize | 10 MB | 50 MB | 25 MB |
| maxRoomStorage | 100 MB | 500 MB | 250 MB |
| membersCanInvite | false | false | true |
| retention | ephemeral | persistent | session |
| idleTimeout | 1 hour | 24 hours | 4 hours |

---

## Throttle Settings

Throttling prevents abuse, protects host resources, and ensures fair participation in multi-party rooms. Every participant is throttled independently.

### Throttle Configuration

```typescript
interface ThrottleConfig {
  /** Messages per minute per participant */
  messagesPerMinute: number;

  /** Maximum message size (bytes) */
  maxMessageSize: number;

  /** File uploads per minute per participant */
  uploadsPerMinute: number;

  /** Maximum concurrent connections to room */
  maxConnections: number;

  /** Bandwidth limit per participant (bytes/sec, 0 = unlimited) */
  bandwidthLimit: number;

  /** Burst allowance: messages allowed in burst before throttle kicks in */
  burstSize: number;

  /** Penalty: seconds of silence after hitting throttle limit */
  penaltySeconds: number;

  /** Agent-specific multiplier (agents may need higher limits) */
  agentMultiplier: number;
}
```

### Default Throttle Presets

| Preset | msg/min | msg size | uploads/min | bandwidth | burst |
|--------|:-------:|:--------:|:-----------:|:---------:|:-----:|
| **Strict** | 10 | 4 KB | 1 | 100 KB/s | 3 |
| **Standard** | 60 | 32 KB | 5 | 1 MB/s | 10 |
| **Relaxed** | 300 | 256 KB | 30 | 10 MB/s | 50 |
| **Agent** | 120 | 64 KB | 10 | 5 MB/s | 20 |

The room owner selects a preset or configures custom limits. Per-role overrides allow agents to have different limits than human participants.

### Throttle Enforcement

```
  Participant sends message
         │
         ▼
  ┌──────────────────────┐
  │  Check rate counter   │
  │  (sliding window)     │
  │                        │
  │  Counter < limit?      │
  │  ├── Yes → deliver     │
  │  └── No  → penalty     │
  │           │             │
  │           ▼             │
  │     Send 'throttled'    │
  │     event to sender     │
  │     Wait penaltySeconds │
  │     before accepting    │
  │     next message        │
  └──────────────────────┘
```

Throttle state is per-participant, per-room. Hitting the limit in one room does not affect other rooms.

---

## File Sharing & Sandboxed Shared Folders

### Self-Hosted Node: Filesystem Sandbox

Each room gets a sandboxed directory on the host machine:

```
/tmp/bt-rooms/
├── <room-id-1>/
│   ├── .room.json          # room metadata, permissions, throttle config
│   ├── .participants.json  # current participants and roles
│   └── files/
│       ├── document.pdf    # uploaded by Wallet A
│       ├── notes.md        # uploaded by Wallet B
│       └── screenshot.png  # uploaded by Agent X
│
├── <room-id-2>/
│   └── files/
│       └── ...
```

**Sandbox enforcement:**
- Path traversal prevention (`os.path.commonpath` check against room root)
- Per-room storage quota (enforced on upload)
- Per-file size limit (enforced on upload)
- Upload rate limiting (per throttle config)
- Filename sanitization (alphanumeric + dash + underscore + dot only)
- No symlinks allowed
- No executable permissions set on uploaded files

**File operations:**

| Operation | Roles | Transport |
|-----------|-------|-----------|
| Upload file | Owner, Admin, Member, Agent (if allowed) | WebSocket binary frame |
| List files | All roles | JSON response |
| Download file | All roles | WebSocket binary frame |
| Delete file | Owner, Admin, file uploader | JSON command |
| Rename file | Owner, Admin | JSON command |

### XMTP Transport: Remote Attachments

When using XMTP as transport, files use the [remote attachment content type](https://github.com/xmtp/xmtp-js):

1. File is encrypted locally (AES-256-GCM)
2. Encrypted file is uploaded to storage (IPFS, S3, or pmVPN server via SFTP)
3. The encryption key + storage URL are sent as an XMTP message
4. Recipient fetches the encrypted file, decrypts with the key from the message

This means files are end-to-end encrypted even at rest on the storage server.

---

## AI Agent Participation

### Agents as First-Class Participants

AI agents participate in rooms with their own wallet identities. They sign messages, receive messages, and follow the same permission/throttle rules as human participants.

**Agent types:**

| Agent Type | Identity | Transport | Use Case |
|-----------|----------|-----------|----------|
| **XMTP Agent** | XMTP wallet identity | XMTP network | Persistent bots, cross-app agents |
| **Local Agent** | Derived wallet (from SSH key or generated) | Self-hosted node | Claude via pmVPN, custom scripts |
| **Claude Remote** | pmVPN service wallet | Self-hosted node | AI assistant via Remote Control |

### Dojo: Human-AI and AI-AI Multi-Chat

The dojo room type is designed for collaborative sessions between humans and AI agents:

```
  ┌──────────────────���─────────────────────────────────────────┐
  │  Dojo: "Code Review Session"                                │
  │                                                              │
  │  [Human] Professor Codephreak:                              │
  │    Review the auth module for timing attacks                │
  │                                                              │
  │  [Agent] Claude:                                            │
  │    I've read server/src/auth/verifier.ts. The               │
  │    verifyMessage() call is constant-time (viem              │
  │    uses noble-secp256k1 which is CT). However,             │
  │    the nonce lookup in challenge.ts uses Map.get()          │
  │    which is not constant-time. Recommendation: ...          │
  │                                                              │
  │  [Agent] SecurityBot:                                       │
  │    Confirming Claude's analysis. I also found that          │
  │    the error messages differ between "invalid nonce"        │
  │    and "expired nonce" — this leaks timing info.            │
  │                                                              │
  │  [Human] Web3dGuy:                                          │
  │    Good catches. Claude, can you draft a fix?               │
  │                                                              │
  │  [Agent] Claude:                                            │
  │    📎 Attached: auth-timing-fix.patch (2.1 KB)              │
  │                                                              │
  │  ─── Shared Files ──────────────────────────────────────── │
  │  auth-timing-fix.patch    Claude       2.1 KB    just now  │
  │  verifier.ts              ProfCodephk  4.8 KB    2m ago    │
  └────────────────────────────────────────────────────────────┘
```

**AI-to-AI workflow:**

Agents can be configured to respond to each other, enabling:
- **Chain of verification** — Agent A reviews code, Agent B verifies A's findings
- **Adversarial testing** — Agent A writes code, Agent B tries to break it
- **Research synthesis** — Multiple agents search different sources, synthesize in the dojo
- **Translation pipeline** — Agent A generates, Agent B translates, Agent C reviews

**Guard rails for AI-AI loops:**

| Guard | Purpose |
|-------|---------|
| Agent throttle rate | Prevents flooding (configurable per agent) |
| Max consecutive agent messages | Stops infinite loops (default: 5 before human must respond) |
| Total agent message budget | Per-session cap on agent messages (default: 100) |
| Cooldown period | Minimum delay between agent responses (default: 2 seconds) |
| Human interrupt | Any human message resets agent turn counters |

### Agent Integration with XMTP

Using the [XMTP Agent SDK](https://github.com/xmtp/xmtp-js) (`@xmtp/agent-sdk`):

```typescript
import { Agent } from '@xmtp/agent-sdk';

const agent = await Agent.createFromEnv();

agent.on('text', async (message) => {
  // Agent receives a message in a blocktalk room
  const response = await processWithClaude(message.content);
  await message.reply(response);
});

agent.on('group', async (group) => {
  // Agent is added to a new dojo
  await group.send('Hello! I am ready to assist.');
});

agent.start();
```

### Agent Integration with Self-Hosted Node

For local agents (e.g., Claude via pmVPN Remote Control):

```typescript
import WebSocket from 'ws';
import { canonicalize, createMessage } from '@pmvpn/blocktalk';

const ws = new WebSocket('ws://localhost:2208'); // blocktalk node port

ws.on('open', () => {
  // Authenticate with agent's derived wallet
  ws.send(JSON.stringify({
    type: 'auth',
    room: roomId,
    payload: { address: agentAddress, signature: authSignature, nonce },
  }));
});

ws.on('message', async (data) => {
  const event = JSON.parse(data);
  if (event.type === 'message' && event.from !== agentAddress) {
    // Process message, generate response
    const response = await generateResponse(event.payload.content);
    const { message, signable } = createMessage(agentAddress, '*', response);
    const signature = await signWithDerivedKey(signable);
    ws.send(JSON.stringify({
      type: 'chat',
      room: roomId,
      payload: { ...message, signature },
    }));
  }
});
```

---

## Encryption

### Self-Hosted Node Encryption

For rooms running on a self-hosted node, encryption uses established Bernstein primitives:

```
  Room creation:
    Owner generates X25519 keypair
    Room public key shared in invite

  Participant joins:
    Participant generates X25519 keypair
    ECDH: shared_secret = X25519(my_private, room_public)
    Session key = HKDF-SHA256(shared_secret, salt=room_id, info="blocktalk-session")

  Message encryption:
    nonce = random 12 bytes (unique per message)
    ciphertext = ChaCha20-Poly1305(key=session_key, nonce, plaintext)
    Wire format: nonce (12) || ciphertext (variable) || tag (16)
```

| Primitive | Algorithm | Standard |
|-----------|-----------|----------|
| Key exchange | [X25519](https://cr.yp.to/ecdh.html) ECDH | [RFC 7748](https://www.rfc-editor.org/rfc/rfc7748) |
| Key derivation | [HKDF-SHA256](https://tools.ietf.org/html/rfc5869) | [RFC 5869](https://tools.ietf.org/html/rfc5869) |
| Message encryption | [ChaCha20-Poly1305](https://cr.yp.to/chacha.html) | [RFC 8439](https://www.rfc-editor.org/rfc/rfc8439) |
| Message signing | [secp256k1](https://www.secg.org/sec2-v2.pdf) ECDSA ([EIP-191](https://eips.ethereum.org/EIPS/eip-191)) | Ethereum |
| File encryption | [ChaCha20-Poly1305](https://cr.yp.to/chacha.html) (same session key) | [RFC 8439](https://www.rfc-editor.org/rfc/rfc8439) |

**Forward secrecy:** The self-hosted node does not provide forward secrecy by default. Session keys are derived once per participant join and remain static for the session. For forward secrecy, use XMTP transport (MLS provides it).

### XMTP Network Encryption

When using XMTP transport, encryption is handled by the [MLS protocol (RFC 9420)](https://www.rfc-editor.org/rfc/rfc9420):

| Property | Value |
|----------|-------|
| Ciphersuite | MLS_128_HPKEX25519_CHACHA20POLY1305_SHA256_Ed25519 |
| Forward secrecy | Yes — keys ratchet forward with each message |
| Post-compromise security | Yes — regular key rotation via MLS commit |
| Message authentication | [Ed25519](https://ed25519.cr.yp.to/) digital signatures |
| Quantum resistance | Hybrid [ML-KEM](https://csrc.nist.gov/pubs/fips/203/final) + X25519 for Welcome messages |
| Group key management | MLS tree-based key agreement |

---

## Cypherpunk2048 Compliance

| Principle | How blocktalk v2 Implements It |
|-----------|-------------------------------|
| **Keys are identity** | Wallet address = room identity. No usernames. No registration. No email. |
| **Verification replaces trust** | Every message is wallet-signed. [viem.verifyMessage()](https://viem.sh/docs/actions/public/verifyMessage) at every boundary. |
| **Sovereignty** | Self-hosted node: your machine, your room, your rules. No cloud dependency. |
| **Privacy** | End-to-end encryption on both transports. No metadata leakage on self-hosted. |
| **Permissionless** | Any wallet can open a room. No approval required. MIT license. |
| **Minimal trust** | Self-hosted: zero external dependencies. XMTP: trust the MLS math, not an institution. |
| **Consent** | Every participant explicitly joins. No silent observation. Role changes require owner action. |
| **Throttle as protection** | Rate limiting protects all parties — participants, host, and network. Not censorship — fairness. |

---

## Architecture: How It Fits in pmVPN

```
  pmvpn/
  ├── server/                    8 ports (existing)
  ├── client/                    Tauri + browser (existing)
  ├── crypto-ssh/                Key derivation (existing)
  ├── remote-control.sh          Claude Remote Control (existing)
  │
  └── blocktalk/                 v2 module (new)
      ├── src/
      │   ├── index.ts           Module exports
      │   ├── room.ts            Room lifecycle (create, join, leave, destroy)
      │   ├── node.ts            Self-hosted WebSocket event server
      │   ├── xmtp.ts            XMTP transport adapter
      │   ├── direct.ts          Direct transport (v1 compat)
      │   ├── message.ts         Message types, signing, verification (extends v1)
      │   ├── permissions.ts     Role-based access control
      │   ├── throttle.ts        Rate limiting and bandwidth control
      │   ├── files.ts           Sandboxed file sharing
      │   ├── encryption.ts      X25519 + ChaCha20-Poly1305 for self-hosted
      │   └── agent.ts           AI agent participant interface
      ├── package.json
      └── tsconfig.json

  blocktalk/ (existing v1, preserved)
  ├── src/
  │   ├── message.ts             Original message codec (reused by v2)
  │   ├── store.ts               localStorage persistence
  │   └── app.ts                 Standalone UI
  └── README.md
```

### Port Allocation

The self-hosted blocktalk node uses a new port offset:

| Port | Offset | Service |
|------|--------|---------|
| 2200–2207 | +0 to +7 | Existing pmVPN services |
| 2208 | +8 | blocktalk self-hosted node (WebSocket) |

Configurable via `PMVPN_BLOCKTALK_PORT` environment variable.

---

## Message Types (v2 Extension)

blocktalk v2 extends the v1 message type system:

```typescript
type MessageType =
  // v1 types (preserved)
  | 'text'
  | 'share-invite'
  | 'file'
  | 'key-exchange'
  // v2 additions
  | 'room-invite'        // invite to join a room
  | 'room-update'        // room metadata change notification
  | 'file-manifest'      // list of files in shared folder
  | 'reaction'           // emoji reaction to a message
  | 'reply'              // threaded reply to a specific message
  | 'agent-action'       // structured action request for AI agents
  | 'agent-result'       // structured result from AI agent
  | 'system'             // room system messages (join, leave, kick, role change)
```

### XMTP Content Type Mapping

| blocktalk type | XMTP content type |
|----------------|-------------------|
| text | `ContentTypeText` (built-in) |
| file | `ContentTypeRemoteAttachment` |
| reaction | `ContentTypeReaction` |
| reply | `ContentTypeReply` |
| room-invite | Custom: `blocktalk.org/room-invite:1.0` |
| agent-action | Custom: `blocktalk.org/agent-action:1.0` |
| agent-result | Custom: `blocktalk.org/agent-result:1.0` |
| system | Custom: `blocktalk.org/system:1.0` |

---

## Usage

### Open a Room (Self-Hosted)

```bash
# From pmVPN client UI: click "Open Room" → choose type → share invite

# Or via CLI:
cd pmvpn/blocktalk
pnpm run node --type dojo --name "Code Review" --port 2208
# → Room ID: a1b2c3d4...
# → Invite: ws://192.168.1.50:2208/room/a1b2c3d4
# → QR code displayed in terminal
```

### Join a Room

```bash
# From pmVPN client UI: paste invite link → authenticate with wallet

# Or via XMTP:
# Room creator sends room-invite message via XMTP
# Recipient clicks invite → joins via XMTP group conversation
```

### Invite an AI Agent

```bash
# In a dojo room, the owner can add an agent:
# UI: "Add Agent" → select agent type → agent joins with its wallet identity

# Programmatically (XMTP Agent SDK):
import { Agent } from '@xmtp/agent-sdk';
const agent = await Agent.createFromEnv();
// Agent automatically responds to messages in rooms it's added to
```

---

## Security Considerations

| Threat | Self-Hosted Mitigation | XMTP Mitigation |
|--------|------------------------|-----------------|
| Eavesdropping | ChaCha20-Poly1305 E2E encryption | MLS E2E encryption |
| Message tampering | Wallet signature on every message | MLS message authentication |
| Replay attacks | Nonce per message, deduplication | MLS epoch-based replay protection |
| Unauthorized access | Wallet-gated join, permission roles | XMTP group membership management |
| Flooding / DoS | Throttle per participant, bandwidth limits | XMTP network-level rate limiting |
| AI agent abuse | Consecutive message limits, cooldowns, budget caps | Same + XMTP moderation tools |
| Host resource exhaustion | Sandboxed storage, per-room quotas, max participants | Off-host (XMTP network handles delivery) |
| Metadata leakage | Self-hosted: only host sees connection metadata | XMTP: MLS PrivateMessage hides sender in group |

---

## References

### Protocol Standards

- [RFC 9420](https://www.rfc-editor.org/rfc/rfc9420) — Messaging Layer Security (MLS) Protocol
- [RFC 8439](https://www.rfc-editor.org/rfc/rfc8439) — ChaCha20 and Poly1305 for IETF Protocols
- [RFC 7748](https://www.rfc-editor.org/rfc/rfc7748) — Elliptic Curves for Security (X25519)
- [RFC 5869](https://tools.ietf.org/html/rfc5869) — HMAC-based Extract-and-Expand Key Derivation Function
- [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455) — The WebSocket Protocol
- [EIP-191](https://eips.ethereum.org/EIPS/eip-191) — Signed Data Standard

### XMTP

- [xmtp.org](https://xmtp.org/) — Protocol documentation and developer resources
- [github.com/xmtp](https://github.com/xmtp) — Open source repositories
- [xmtp/xmtp-js](https://github.com/xmtp/xmtp-js) — TypeScript SDKs (browser, node, agent)
- [xmtp/libxmtp](https://github.com/xmtp/libxmtp) — Core Rust library with MLS implementation
- [xmtp/xmtpd](https://github.com/xmtp/xmtpd) — Network node daemon
- [xmtp.chat](https://xmtp.chat/) — Reference web application

### Cryptography

- [cr.yp.to](https://cr.yp.to/) — Daniel J. Bernstein's cryptographic research
- [ed25519.cr.yp.to](https://ed25519.cr.yp.to/) — Ed25519 high-speed signatures
- [cr.yp.to/chacha.html](https://cr.yp.to/chacha.html) — ChaCha stream cipher
- [cr.yp.to/ecdh.html](https://cr.yp.to/ecdh.html) — Curve25519 ECDH
- [secg.org/sec2-v2.pdf](https://www.secg.org/sec2-v2.pdf) — secp256k1 curve parameters
- [keccak.team](https://keccak.team/keccak.html) — Keccak (SHA-3) sponge construction

### Heritage

- [blocktalk v1](../../blocktalk/) — Original wallet-to-wallet messaging (484 lines, MIT)
- [csshd](https://github.com/cryptoAGI/csshd) — First wallet-login SSH server
- [pmVPN](../README.md) — Wallet-authenticated remote access
- [PARSEC Wallet](https://github.com/cypherpunk2048/parsec-wallet) — Sovereign wallet architecture
- [viem](https://viem.sh/) — Ethereum signature verification

---

*Your wallet opens the room. Your signature proves you belong. Your throttle protects everyone inside.*

*Professor Codephreak — cypherpunk2048*
