# Modular Navigation Architecture

*Top-bar module switching, identity separation, and AI interaction boundaries*

---

## Overview

pmVPN evolves from a single-module terminal client into a modular dApp platform. Each module (pmVPN, blocktalk, Citadel, crypto-ssh) becomes a button in a top navigation bar. Modules share wallet authentication but are otherwise independent. AI interaction is architecturally separated from wallet identity — AI cannot access private keys, and person-to-AI conversations are private from other AI.

---

## Top Navigation Bar

### Layout

```
  Desktop (>520px):
  ┌─────────────────────────────────────────────────────────────────────┐
  │  [pmVPN]  [blocktalk]  [Citadel]  [crypto-ssh]    [0xf3..92] [✕]  │
  │   ━━━━━                                            wallet    exit  │
  └─────────────────────────────────────────────────────────────────────┘
       ▲ active module (underline indicator)

  Mobile (<520px):
  ┌───────────────────────────────────────┐
  │  [pm] [bt] [ct] [cs]    [0xf3] [✕]   │
  └───────────────────────────────────────┘
       abbreviated labels on mobile
```

### Module Buttons

| Button | Module | Content | Status |
|--------|--------|---------|:------:|
| **pmVPN** | Terminal access | Sidebar (wallet + connections) + main (terminal/files/share) + footer (tools/log) | Live |
| **blocktalk** | Messaging | Room list + conversation view + file sharing | Future |
| **Citadel** | On-chain rooms | Discovery panel + room management + token gate status | Future |
| **crypto-ssh** | Key tools | Derivation UI: wallet→SSH, SSH→wallet, key export | Future |

### Module Switching

```typescript
type ActiveModule = 'pmvpn' | 'blocktalk' | 'citadel' | 'cryptossh';

interface ModuleDefinition {
  id: ActiveModule;
  label: string;
  shortLabel: string;          // for mobile
  createPanel: () => HTMLElement;
  onActivate?: () => void;     // called when module becomes active
  onDeactivate?: () => void;   // called when module is hidden
}

// Module registry
const modules: ModuleDefinition[] = [
  {
    id: 'pmvpn',
    label: 'pmVPN',
    shortLabel: 'pm',
    createPanel: () => createPmvpnPanel(),   // current app.ts content
  },
  {
    id: 'blocktalk',
    label: 'blocktalk',
    shortLabel: 'bt',
    createPanel: () => createBlocktalkPanel(),
  },
  {
    id: 'citadel',
    label: 'Citadel',
    shortLabel: 'ct',
    createPanel: () => createCitadelPanel(),
  },
  {
    id: 'cryptossh',
    label: 'crypto-ssh',
    shortLabel: 'cs',
    createPanel: () => createCryptoSSHPanel(),
  },
];

// Switch module: hide all panels, show selected
function switchModule(id: ActiveModule) {
  for (const mod of modules) {
    mod.panel.style.display = mod.id === id ? '' : 'none';
    if (mod.id === id) mod.onActivate?.();
    else mod.onDeactivate?.();
  }
  // Update nav bar active indicator
}
```

### Shared Elements

These elements persist across all modules (not recreated on switch):

| Element | Location | Purpose |
|---------|----------|---------|
| Navigation bar | Top | Module buttons + wallet + exit |
| Wallet display | Top right | Address, logout — shared identity |
| Status bar | Bottom | Connection status, session count |
| Log panel | Bottom (collapsible) | Shared log across all modules |

### Module-Specific Elements

Each module owns its own:

| Element | Scope | Notes |
|---------|-------|-------|
| Sidebar | Per-module | pmVPN: host list. blocktalk: room list. Citadel: discovery. |
| Main content | Per-module | pmVPN: terminal/files/share. blocktalk: conversation. |
| Footer details | Per-module | pmVPN: diagnostics/tools. blocktalk: room settings. |

---

## Hover Popover — Module Introduction

### Desktop: Hover on Module Button

When the mouse hovers over a module button for 500ms, a popover appears below:

```
  [pmVPN]  ← hover
      │
      ▼
  ┌──────────────────────────────────────────┐
  │  pmVPN — Poor Man's VPN                  │
  │                                          │
  │  Wallet-authenticated remote access.     │
  │  Your wallet is your key.                │
  │  Your signature is your password.        │
  │                                          │
  │  Terminal · File Browser · P2P Share     │
  │  Multi-host · Bootstrap · VPN Tunnel     │
  │                                          │
  │  ┌────────────────────────────────────┐  │
  │  │  ? Ask about pmVPN...             │  │  ← AI interaction box (future)
  │  │                                    │  │
  │  └────────────────────────────────────┘  │
  │                                          │
  │  Docs · GitHub · cypherpunk2048          │
  └──────────────────────────────────────────┘
```

### Mobile: Long-Press on Module Button

Same popover, triggered by 500ms touch-hold instead of hover.

### Per-Module Popover Content

| Module | Title | Description | Features |
|--------|-------|-------------|----------|
| **pmVPN** | Poor Man's VPN | Wallet-authenticated remote access | Terminal, Files, Share, Multi-host, Bootstrap, Tunnel |
| **blocktalk** | Wallet Messaging | Private rooms, AI collaboration | Private, Boardroom, Dojo, XMTP, File sharing |
| **Citadel** | Permanent Rooms | Blockchain-registered, token-gated | On-chain registry, Token gates, Discovery, Resurrection |
| **crypto-ssh** | Key Derivation | SSH ↔ Wallet key bridging | Wallet→SSH, SSH→Wallet, HD wallets, Service wallets |

### AI Interaction Box

The popover includes a text input box labeled "? Ask about [module]..." This is a **placeholder** for future AI integration. Design constraints:

1. The AI box has **NO access to the wallet**. It cannot sign, cannot read private keys.
2. The AI box communicates via text only — it sends a question and receives an answer.
3. The AI backend is a [blocktalk dojo](BLOCKTALK.md) room or [Remote Control](REMOTE-CONTROL.md) session.
4. The AI response appears in the popover, not in the terminal or any wallet-connected context.

Implementation deferred to when blocktalk v2 or Remote Control is wired into the web client.

---

## Identity Architecture

### Three Isolated Domains

pmVPN enforces strict separation between three identity contexts. No domain can access another domain's secrets. Crossing a domain boundary requires explicit, auditable action.

```
  ┌───────────────────────────────────────────────────────────────┐
  │                                                               │
  │   DOMAIN 1: WALLET IDENTITY                                  │
  │   ─────────────────────────                                   │
  │                                                               │
  │   Source:    MetaMask / MetaMask SDK / Hardware wallet         │
  │   Key type:  secp256k1 (Ethereum)                             │
  │   Storage:   MetaMask (encrypted, never exported)             │
  │                                                               │
  │   What it does:                                               │
  │     Signs challenges → proves you own the address             │
  │     Signs messages → proves authorship in blocktalk           │
  │     Holds tokens → proves membership in Citadel               │
  │                                                               │
  │   What it CANNOT do:                                          │
  │     Execute terminal commands                                 │
  │     Access AI services                                        │
  │     Read or modify server files                               │
  │     Interact with AI on behalf of the user                    │
  │                                                               │
  │   AI access: NONE                                             │
  │     AI cannot trigger wallet signing                          │
  │     AI cannot read the private key                            │
  │     AI cannot impersonate the wallet                          │
  │                                                               │
  └───────────────────────────────────────────────────────────────┘

  ┌───────────────────────────────────────────────────────────────┐
  │                                                               │
  │   DOMAIN 2: AI IDENTITY                                      │
  │   ─────────────────────                                       │
  │                                                               │
  │   Source:    Derived wallet (crypto-ssh) or XMTP agent key    │
  │   Key type:  secp256k1 (derived via HKDF from Ed25519)       │
  │   Storage:   Server memory (zeroed after use)                 │
  │                                                               │
  │   What it does:                                               │
  │     Signs AI messages → proves which AI said what             │
  │     Participates in blocktalk dojos as an agent               │
  │     Executes commands via Remote Control (server-side)        │
  │                                                               │
  │   What it CANNOT do:                                          │
  │     Access the user's wallet private key                      │
  │     Sign transactions on behalf of the user                   │
  │     Read other AI's conversations with the user               │
  │     Impersonate the user's wallet identity                    │
  │                                                               │
  │   Privacy guarantees:                                         │
  │     Person ↔ AI-A conversations: private from AI-B            │
  │     AI-A ↔ AI-B conversations: private from person            │
  │       (unless person is in the same dojo room)                │
  │     AI identity ≠ wallet identity (different keys)            │
  │                                                               │
  └───────────────────────────────────────────────────────────────┘

  ┌───────────────────────────────────────────────────────────────┐
  │                                                               │
  │   DOMAIN 3: SESSION IDENTITY                                  │
  │   ─────────────────────────                                   │
  │                                                               │
  │   Source:    Challenge-response per server connection          │
  │   Key type:  Wallet signature (one-time use)                  │
  │   Storage:   In-memory (cleared on disconnect)                │
  │                                                               │
  │   What it does:                                               │
  │     Authenticates to pmVPN server (SSH/WebSocket)             │
  │     Maps wallet address → Linux username on server            │
  │     Grants terminal, SFTP, and tunnel access                  │
  │                                                               │
  │   What it CANNOT do:                                          │
  │     Persist beyond the connection lifetime                    │
  │     Access other users' sessions                              │
  │     Be reused (nonce is single-use, 60s TTL)                 │
  │                                                               │
  │   AI access: NONE                                             │
  │     Terminal sessions are human-only                          │
  │     AI uses Remote Control (separate process, separate auth)  │
  │                                                               │
  └───────────────────────────────────────────────────────────────┘
```

### Why Three Domains

| Threat | How Isolation Prevents It |
|--------|--------------------------|
| AI reads private key | AI is in Domain 2, private key is in Domain 1. No API crosses the boundary. |
| AI signs wallet transactions | AI has its own derived key (Domain 2). Cannot trigger MetaMask signing. |
| AI impersonates user in chat | AI messages are signed with Domain 2 key. Verifier sees different address. |
| AI-A reads AI-B's conversations | Each AI has a separate derived identity. Room-level encryption isolates conversations. |
| Terminal session hijacked by AI | Terminal auth is Domain 3 (challenge-nonce). AI uses Domain 2 (Remote Control). Different auth paths. |
| Server reads wallet key | Server only sees the signature (Domain 3). Private key never leaves MetaMask (Domain 1). |

### Domain Crossing Rules

| From | To | Allowed? | How |
|------|----|:--------:|-----|
| Wallet → Session | Domain 1 → 3 | Yes | User signs challenge, server verifies signature |
| Wallet → AI | Domain 1 → 2 | **No** | AI cannot access wallet. Ever. |
| AI → Session | Domain 2 → 3 | **No** | AI uses Remote Control (separate process), not terminal auth |
| AI → Wallet | Domain 2 → 1 | **No** | AI cannot trigger signing or read keys |
| Session → Wallet | Domain 3 → 1 | **No** | Server cannot extract private key from signature |
| Session → AI | Domain 3 → 2 | **No** | Terminal sessions don't communicate with AI agents |
| AI-A → AI-B | Domain 2 → 2 | Dojo only | AI agents can converse in shared dojo rooms, but each has its own key |
| Person → AI | Domain 1 text → 2 | Yes | Via blocktalk room or AI box (text only, no key access) |

---

## Module Panel Architecture

### File Structure (Future)

```
client/src/
├── main.ts                   Entry point — initializes nav + first module
├── nav.ts                    NEW: navigation bar, module registry, popover
├── modules/
│   ├── pmvpn/
│   │   ├── panel.ts          Current app.ts refactored as a module panel
│   │   ├── sidebar.ts        Wallet + connections (extracted from app.ts)
│   │   └── popover.ts        pmVPN intro text + AI box placeholder
│   ├── blocktalk/
│   │   ├── panel.ts          Room list + conversation view
│   │   ├── sidebar.ts        Room browser, contact list
│   │   └── popover.ts        blocktalk intro text
│   ├── citadel/
│   │   ├── panel.ts          Discovery + room management
│   │   ├── sidebar.ts        Chain selector, token gate status
│   │   └── popover.ts        Citadel intro text
│   └── cryptossh/
│       ├── panel.ts          Key derivation UI
│       └── popover.ts        crypto-ssh intro text
├── auth.ts                   Wallet auth (shared across all modules)
├── terminal.ts               Terminal manager (pmVPN module only)
├── files.ts                  File browser (pmVPN module only)
├── share.ts                  P2P sharing (pmVPN module only)
├── bootstrap.ts              Server bootstrap (pmVPN module only)
├── hostkeys.ts               TOFU verification (pmVPN module only)
└── style.ts                  All CSS (nav bar styles added)
```

### Migration Path

1. **Phase 1** (current): Single-module app. Navigation bar is pmVPN only. Other buttons are placeholders showing "Coming Soon" in their popovers.
2. **Phase 2**: Extract pmVPN-specific code from `app.ts` into `modules/pmvpn/panel.ts`. Navigation bar switches between pmVPN and placeholder panels.
3. **Phase 3**: Implement blocktalk panel (rooms, messaging, XMTP integration).
4. **Phase 4**: Implement Citadel panel (discovery, token gates, on-chain operations).
5. **Phase 5**: Implement crypto-ssh panel (key derivation UI, export/import).

Each phase is independently deployable. The navigation bar works from Phase 1 — unimplemented modules show their intro popover with a "Coming Soon" message.

---

## CSS Architecture

### Navigation Bar Styles

```css
.pmvpn-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  background: var(--card);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.pmvpn-nav-modules {
  display: flex;
  padding: 0 4px;
}

.pmvpn-nav-btn {
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-family: 'JetBrains Mono', monospace;
  position: relative;
}

.pmvpn-nav-btn:hover { color: var(--foreground); }
.pmvpn-nav-btn.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

/* Popover */
.pmvpn-popover {
  position: absolute;
  top: 100%;
  left: 0;
  width: 360px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  z-index: 100;
  display: none;
}

.pmvpn-nav-btn:hover .pmvpn-popover { display: block; }

/* AI box placeholder */
.pmvpn-ai-box {
  margin-top: 12px;
  padding: 10px;
  background: var(--input);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--muted-foreground);
  font-size: 12px;
  font-style: italic;
}

/* Mobile: compact nav */
@media (max-width: 520px) {
  .pmvpn-nav-btn { padding: 6px 10px; font-size: 9px; }
  .pmvpn-popover { width: 280px; padding: 12px; }
}
```

---

## Cypherpunk2048 Compliance

| Principle | Navigation Architecture Implementation |
|-----------|---------------------------------------|
| **Keys are identity** | Wallet address shared across all modules as the single identity |
| **Verification replaces trust** | Each module verifies wallet signature independently |
| **Sovereignty** | Modules are independent — disable any module without affecting others |
| **Privacy** | AI cannot access wallet. Person-AI conversations private from other AI. AI-AI conversations private from person (unless in shared room). |
| **Permissionless** | Any module can be added. Navigation bar is a registry, not a gatekeeper. |
| **Minimal trust** | No module trusts another module's state. Each verifies wallet signature independently. |

---

## References

- [QUICKSTART.md](QUICKSTART.md) — First-experience guide
- [BLOCKTALK.md](BLOCKTALK.md) — Room architecture and transport modes
- [CITADEL.md](CITADEL.md) — On-chain permanent rooms
- [CRYPTO-SSH.md](CRYPTO-SSH.md) — Key derivation module
- [REMOTE-CONTROL.md](REMOTE-CONTROL.md) — Claude AI integration
- [AUDIT.md](AUDIT.md) — Full codebase audit

---

*Modules are sovereign. Identity is shared. AI is isolated. Keys never cross domain boundaries.*

*Professor Codephreak — cypherpunk2048*
