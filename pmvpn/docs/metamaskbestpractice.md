# MetaMask Authentication Best Practice

*True logout and session management for wallet-authenticated dApps*

Updated: 2026-03-21

---

## The Hard Truth

**A dApp cannot force MetaMask to ask for its password.** MetaMask's internal lock is controlled by the user, not by websites. This is by design — it prevents malicious sites from locking users out of their wallet.

What a dApp CAN control:
- Whether the dApp considers the user logged in (session state)
- Whether MetaMask remembers the site's permission (`wallet_revokePermissions`)
- Whether to silently check for accounts (`eth_accounts`) or trigger a popup (`eth_requestAccounts`)

---

## Key Distinction: Two Kinds of "Connected"

| Layer | Who Controls It | What It Means |
|-------|----------------|---------------|
| **MetaMask unlocked** | User (password/biometric) | Wallet is decrypted in browser memory |
| **Site approved** | MetaMask permission system | Site can call `eth_accounts` and get results |
| **dApp session active** | Your code | Your app considers the user logged in |

Logout must clear layers 2 and 3. Layer 1 is not your business.

---

## eth_accounts vs eth_requestAccounts

| Method | Popup? | Returns if not approved |
|--------|--------|------------------------|
| `eth_accounts` | No | `[]` (empty array) |
| `eth_requestAccounts` | Yes (if not approved) | Accounts after approval |

**After `wallet_revokePermissions`:**
- `eth_accounts` returns `[]` — this is your gate
- `eth_requestAccounts` will show the approval popup again

**The mistake:** Using `eth_requestAccounts` on page load. This auto-reconnects if MetaMask still has the site approved — bypassing your logout.

**The fix:** On page load, check `eth_accounts` silently. If empty, show login button. Only call `eth_requestAccounts` when the user explicitly clicks "Connect MetaMask".

---

## Correct Logout Implementation

```javascript
async function logout() {
  // 1. Revoke MetaMask site permission
  try {
    await window.ethereum.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    });
  } catch {
    // Older MetaMask — permission stays, but our session gate handles it
  }

  // 2. Clear dApp session state — THIS is the real logout
  sessionActive = false;
  walletClient = null;
  connectedAddress = null;

  // 3. Clear any persisted state
  localStorage.removeItem('pmvpn-wallet-address');
  sessionStorage.clear();
}
```

## Correct Login Implementation

```javascript
async function login() {
  // Clear stale state
  sessionActive = false;

  // Force fresh approval — revoke first, then request
  try {
    await window.ethereum.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    });
  } catch {}

  // This WILL show popup because we just revoked
  const accounts = await window.ethereum.request({
    method: 'eth_requestAccounts',
  });

  // Set session
  connectedAddress = accounts[0];
  sessionActive = true;
}
```

## Correct Page Load Check

```javascript
// On page load — NEVER auto-connect
// Only check silently, never call eth_requestAccounts
async function checkExistingSession() {
  if (!sessionActive) return false; // Our gate — most important check

  // Even if we think we have a session, verify MetaMask still agrees
  try {
    const accounts = await window.ethereum.request({
      method: 'eth_accounts', // Silent — no popup
    });
    if (accounts.length === 0) {
      sessionActive = false; // MetaMask revoked us
      return false;
    }
    return true;
  } catch {
    sessionActive = false;
    return false;
  }
}
```

---

## Why MetaMask Still "Remembers" After Logout

1. **MetaMask is unlocked** — the user entered their password at some point. It stays unlocked until auto-lock timeout or manual lock. This is not your concern.

2. **Site permission cached** — `wallet_revokePermissions` should clear this, but behavior varies across MetaMask versions. Some versions re-approve silently on `eth_requestAccounts` if the wallet is unlocked.

3. **dApp state not cleared** — if localStorage or in-memory state still holds the address, the app auto-reconnects.

---

## The pmVPN Solution

pmVPN gates on three conditions, all must be true:

```
sessionActive === true        (our flag, starts false, set only on explicit connect)
connectedAddress !== null     (set only after successful eth_requestAccounts)
walletClient !== null         (viem client, created only during connect flow)
```

On logout:
1. All three cleared immediately
2. `wallet_revokePermissions` called (best effort)
3. localStorage cleared
4. UI reset to "Connect MetaMask" button

On page load:
- `sessionActive` starts `false`
- No auto-connect attempt
- User must click "Connect MetaMask" to start a new session

On connect:
- Revoke permissions first (forces popup on re-request)
- `eth_requestAccounts` (shows MetaMask approval popup)
- Only then set `sessionActive = true`

---

## What You Cannot Do (Accept It)

- Force MetaMask password re-entry
- Lock MetaMask from your dApp
- Prevent MetaMask from showing the site in "Connected Sites"
- Revoke on-chain token approvals (use revoke.cash for that)
- Control MetaMask's auto-lock timer

---

## What Other dApps Do

**Uniswap** — "Disconnect" clears app state + revokes permissions. User can reconnect instantly if MetaMask is unlocked. No password re-entry forced.

**OpenSea** — "Logout" ends server session. Wallet reconnection is separate from site authentication. Uses server-side session tokens.

**Best practice consensus:** Manage your own session. Don't rely on MetaMask's state. The wallet is an identity provider, not a session manager.

---

## Sources

- [MetaMask: How to Connect](https://docs.metamask.io/wallet/how-to/connect/)
- [MetaMask: Manage Permissions](https://docs.metamask.io/wallet/how-to/manage-permissions/)
- [MetaMask: wallet_revokePermissions](https://docs.metamask.io/wallet/reference/json-rpc-methods/wallet_revokepermissions/)
- [MetaMask: Access Accounts](https://docs.metamask.io/wallet/how-to/access-accounts/)
- [MetaMask Support: Disconnect from dApp](https://support.metamask.io/more-web3/dapps/disconnect-wallet-from-a-dapp/)
- [EIP-6963: Multi Injected Provider Discovery](https://eips.ethereum.org/EIPS/eip-6963)
