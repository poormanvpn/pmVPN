# Token-Gated Access Control UI Wrapper

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              UI WRAPPER LAYER                                       │
│                                                                                     │
│  ┌─ Asset Verification ─┐  ┌─ Identity Confirmation ─┐  ┌─ Privilege Vault ─────┐ │
│  │ • ERC-20 balances    │  │ • Signature validation   │  │ • Key derivation      │ │
│  │ • ERC-721 holdings   │  │ • Multi-sig verification │  │ • Secure storage      │ │
│  │ • Algorand ASAs      │  │ • Time-based proof       │  │ • Access delegation   │ │
│  │ • Custom tokens      │  │ • Challenge-response     │  │ • Privilege escalation│ │
│  └─────────────────────┘  └─────────────────────────┘  └─────────────────────────┘ │
│                                          │                                          │
│                                          ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                        CREDENTIAL MATRIX                                    │   │
│  │                                                                             │   │
│  │  Participant + Asset Holdings + Signature = Access Level                   │   │
│  │                                                                             │   │
│  │  ┌─ Basic Access ─┐  ┌─ Elevated ──┐  ┌─ Admin ──────┐  ┌─ Owner ────────┐ │   │
│  │  │ • Terminal     │  │ • File SFTP │  │ • All ports   │  │ • Server mgmt  │ │   │
│  │  │ • Read-only    │  │ • VPN tunnel│  │ • User mgmt   │  │ • Token gates  │ │   │
│  │  └───────────────┘  └─────────────┘  └───────────────┘  └─────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                          │                                          │
│                                          ▼                                          │
└─ ┌─────────────────────────────────────────────────────────────────────────────┐ ─┘
  │                         EXISTING PMVPN CORE                                 │
  │                                                                             │
  │  SSH Servers (8 ports) + Wallet Auth + PM Protocol + Crypto-SSH            │
  └─────────────────────────────────────────────────────────────────────────────┘
```

## Implementation Components

### 1. Asset Holdings Verifier

```typescript
interface AssetRequirement {
  type: 'erc20' | 'erc721' | 'algorand-asa' | 'custom';
  contractAddress: string;
  chainId: number;
  minimumBalance?: bigint;        // For ERC-20
  requiredTokenIds?: string[];    // For ERC-721
  customVerifier?: string;        // Custom contract call
}

interface AccessLevel {
  name: string;
  ports: number[];                // Which pmVPN ports accessible
  permissions: string[];          // What operations allowed
  assetRequirements: AssetRequirement[];
}

class AssetVerifier {
  async verifyHoldings(
    walletAddress: string,
    requirements: AssetRequirement[]
  ): Promise<boolean> {
    // Multi-chain asset verification
    // Integration with existing blockscout MCP tools
    // Caching layer for performance
  }
}
```

### 2. Enhanced Authentication Flow

Current flow:
```
Wallet → Sign Challenge → SSH Connect → Shell
```

Enhanced flow:
```
Wallet → Asset Check → Sign Enhanced Challenge → Privilege Level → Restricted SSH Connect → Scoped Shell
     ↓              ↓                        ↓
  Holdings      Identity Proof         Access Matrix
  Verification  + Time-bound           Determines
                + Multi-factor         Available Ports
```

### 3. Vault Integration Layer

```typescript
interface PrivilegeVault {
  // Secure key derivation from wallet + asset proof
  deriveAccessKey(
    walletSignature: string,
    assetProof: AssetVerification,
    scope: AccessScope
  ): Promise<AccessCredentials>;

  // Temporary privilege delegation
  delegateAccess(
    fromWallet: string,
    toWallet: string,
    duration: number,
    permissions: string[]
  ): Promise<DelegationToken>;

  // Audit trail of access grants
  logAccess(
    wallet: string,
    action: string,
    resources: string[],
    timestamp: number
  ): void;
}
```

### 4. Multi-Factor Identity Confirmation

```typescript
interface IdentityProof {
  walletSignature: string;        // Primary authentication
  assetSignature?: string;        // Proof signed with asset-derived key
  timeProof: number;             // Time-bound challenge
  biometricHash?: string;        // Optional biometric component
  geolocationProof?: string;     // Optional location verification
  deviceFingerprint?: string;    // Device identity component
}

class IdentityConfirmer {
  async buildProof(
    wallet: WalletProvider,
    requirements: IdentityRequirement[]
  ): Promise<IdentityProof> {
    // Multi-layer proof construction
    // Each layer adds security depth
    // Cryptographic binding prevents tampering
  }

  async verifyProof(
    proof: IdentityProof,
    challenge: string
  ): Promise<VerificationResult> {
    // Verify all proof components
    // Check temporal validity
    // Cross-verify signatures
  }
}
```

## UI Components Architecture

### 1. Access Level Indicator

```
┌─ pmVPN ─────────────────────── [🟢 ADMIN] [0xf3..92] ──┐
│  Asset Holdings: ✅ 1000 PMVPN ✅ CitadelNFT #42        │
│  Access Level: ADMIN (All ports + User management)     │
│  Vault Status: 🔒 Secured • 🔑 3 delegations active   │
│  ┌─ Degraded Access Warning ───────────────────────┐    │
│  │ ⚠️ Asset balance below threshold for OWNER      │    │
│  │ Current: 8,500 PMVPN | Required: 10,000 PMVPN   │    │
│  │ Some administrative functions restricted         │    │
│  └─────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────┤
```

### 2. Enhanced Connection Dialog

```
┌─ Connect to Server ──────────────────────────────┐
│  Server: prod.example.com:2200                   │
│  ┌─ Identity Verification ─────────────────────┐  │
│  │ ✅ Wallet: 0xf3..92 (MetaMask)             │  │
│  │ ⏳ Asset Check: Verifying holdings...       │  │
│  │ ✅ Holdings: 5000 PMVPN + CitadelNFT       │  │
│  │ ✅ Access Level: ELEVATED                   │  │
│  │ 🔐 Enhanced Challenge: Sign with assets    │  │
│  └─────────────────────────────────────────────┘  │
│  ┌─ Available Services ────────────────────────┐  │
│  │ ✅ Terminal (Port 2200)                     │  │
│  │ ✅ SFTP (Port 2201)                        │  │
│  │ ✅ VPN Tunnel (Port 2204)                  │  │
│  │ ❌ Admin API (Port 2207) - Requires 10K+   │  │
│  └─────────────────────────────────────────────┘  │
│  [ Cancel ] [ Connect with ELEVATED Access ]      │
└──────────────────────────────────────────────────┘
```

### 3. Privilege Delegation Interface

```
┌─ Delegate Access ────────────────────────────────┐
│  From: 0xf3..92 (Your Admin Account)             │
│  To: 0xa1..34 (Recipient Wallet)                 │
│  ┌─ Permissions ─────────────────────────────┐    │
│  │ ☑️ Terminal Access (Port 2200)           │    │
│  │ ☑️ File Transfer (Port 2201)            │    │
│  │ ☐ VPN Tunnel (Port 2204)                │    │
│  │ ☐ Administrative Functions              │    │
│  └─────────────────────────────────────────┘    │
│  Duration: [24 hours ▼]                         │
│  Require Asset Holdings: ☑️ Min 100 PMVPN       │
│  ┌─ Delegation Key ──────────────────────────┐   │
│  │ 0x7f8a...b2c9 (Derived from your vault)   │   │
│  │ Recipient signs with this key for access  │   │
│  └───────────────────────────────────────────┘   │
│  [ Cancel ] [ Sign Delegation ]                  │
└──────────────────────────────────────────────────┘
```

## Security Architecture

### 1. Layered Authentication

| Layer | Purpose | Implementation |
|-------|---------|----------------|
| **L1: Wallet** | Basic identity | Standard secp256k1 signature |
| **L2: Assets** | Privilege verification | On-chain balance/ownership check |
| **L3: Derived Keys** | Scoped access | HKDF from wallet + asset proof |
| **L4: Time Binding** | Temporal validity | Challenge includes timestamp + expiry |
| **L5: Audit Trail** | Accountability | Immutable access log with signatures |

### 2. Privilege Isolation

```typescript
interface AccessScope {
  walletAddress: string;
  assetProofs: AssetVerification[];
  grantedPorts: number[];
  allowedOperations: OperationType[];
  expiresAt: number;
  derivedFrom: string;           // Parent privilege signature
}

// Each access scope is cryptographically bound
// No privilege escalation without re-verification
// Asset holdings checked on each session start
```

### 3. Secure Delegation Chain

```
Owner Wallet (10,000+ PMVPN)
    │ delegates to
    ▼
Admin Wallet (1,000+ PMVPN)
    │ delegates to
    ▼
User Wallet (any balance)
    │
    └─► Scoped access with inherited limits
        ▼
        Cannot exceed delegator's permissions
```

## Integration with Existing pmVPN

### 1. Enhanced Wallet Mapping

```javascript
// Current: ~/.pmvpn/wallets.json
{
  "0xf3..92": {
    "user": "admin",
    "role": "admin"
  }
}

// Enhanced: ~/.pmvpn/token-gates.json
{
  "levels": {
    "OWNER": {
      "ports": [2200, 2201, 2202, 2203, 2204, 2205, 2206, 2207],
      "operations": ["all"],
      "requirements": [
        {
          "type": "erc20",
          "contract": "0x...",
          "minimumBalance": "10000000000000000000000"
        }
      ]
    },
    "ADMIN": {
      "ports": [2200, 2201, 2202, 2204, 2207],
      "operations": ["terminal", "files", "tunnel", "admin"],
      "requirements": [
        {
          "type": "erc20",
          "contract": "0x...",
          "minimumBalance": "1000000000000000000000"
        }
      ]
    },
    "USER": {
      "ports": [2200, 2201],
      "operations": ["terminal", "files"],
      "requirements": [
        {
          "type": "erc20",
          "contract": "0x...",
          "minimumBalance": "1"
        }
      ]
    }
  }
}
```

### 2. Modified Authentication Endpoint

```typescript
// Enhanced challenge API (port 2203)
app.post('/challenge', async (req, res) => {
  const { address, requestedLevel } = req.body;

  // Verify asset holdings for requested level
  const assetVerification = await verifyAssetRequirements(
    address,
    TOKEN_GATES[requestedLevel].requirements
  );

  if (!assetVerification.valid) {
    return res.status(403).json({
      error: 'insufficient asset holdings',
      required: TOKEN_GATES[requestedLevel].requirements,
      actual: assetVerification.holdings
    });
  }

  // Create enhanced challenge including asset proof
  const challenge = createEnhancedChallenge(address, requestedLevel, assetVerification);
  res.json(challenge);
});
```

### 3. Port-Level Access Control

```typescript
// Modified SSH server creation
const shellServer = createSSHServer(hostKey, walletMap, 'shell', {
  accessControl: async (walletAddress: string) => {
    const level = await determineAccessLevel(walletAddress);
    return TOKEN_GATES[level].ports.includes(2200); // Shell port
  },
  operationFilter: async (walletAddress: string, operation: string) => {
    const level = await determineAccessLevel(walletAddress);
    return TOKEN_GATES[level].operations.includes(operation);
  }
});
```

## Implementation Roadmap

### Phase 1: Asset Verification Foundation (Week 1-2)
- [ ] Multi-chain RPC integration (Ethereum, Polygon, Algorand)
- [ ] ERC-20/ERC-721 balance checking
- [ ] Algorand ASA verification
- [ ] Caching layer for performance
- [ ] Asset verification API endpoints

### Phase 2: Enhanced Authentication (Week 3-4)
- [ ] Multi-factor identity confirmation
- [ ] Enhanced challenge-response protocol
- [ ] Derived key generation from assets
- [ ] Temporal validity enforcement
- [ ] Signature verification improvements

### Phase 3: UI Wrapper Components (Week 5-6)
- [ ] Access level indicator components
- [ ] Enhanced connection dialog
- [ ] Asset holdings display
- [ ] Privilege delegation interface
- [ ] Real-time access monitoring

### Phase 4: Vault Integration (Week 7-8)
- [ ] Secure key derivation from wallet + assets
- [ ] Privilege delegation mechanisms
- [ ] Access scope enforcement
- [ ] Audit trail implementation
- [ ] Emergency access recovery

### Phase 5: Integration & Testing (Week 9-10)
- [ ] Integration with existing pmVPN flows
- [ ] Port-level access control
- [ ] Operation filtering by privilege
- [ ] End-to-end testing
- [ ] Security audit

## Benefits of This Design

1. **Zero Trust**: Every access verified cryptographically
2. **Granular Control**: Asset holdings determine exact permissions
3. **Scalable**: Easy to add new asset types and privilege levels
4. **Auditable**: Complete trail of who accessed what when
5. **Delegatable**: Secure privilege sharing without key sharing
6. **Recoverable**: Multiple restoration paths for access loss
7. **Future-Proof**: Extensible to any blockchain/asset type

This wrapper transforms pmVPN from basic wallet authentication to a comprehensive token-gated infrastructure with fine-grained access control based on verifiable asset holdings.