// crypto-ssh — Bidirectional key derivation between SSH and cryptocurrency wallets
// MIT License
//
// Direction 1: Wallet → SSH
//   Your wallet key derives SSH credentials for passwordless server access.
//   Heritage: cryptoAGI/csshd — the world's first wallet-login SSH server.
//
// Direction 2: SSH → Wallet
//   Your SSH key derives crypto wallets for asset custody.
//   Every ~/.ssh/id_ed25519 is a potential Ethereum wallet.
//   Every server host key is a potential service wallet.
//
// Both directions use HKDF (RFC 5869) for one-way, deterministic derivation.
// Compromising the derived key does NOT compromise the source key.

export {
  // Wallet → SSH
  deriveEd25519FromWallet,
  deriveMultipleKeys,
  createSecp256k1SSHIdentity,
  createAgentChallenge,
  buildIdentitiesAnswer,
  parseSignRequest,
  SSH_AGENT,
  type DerivedSSHKeyPair,
  type Secp256k1SSHIdentity,
  type SSHAgentChallenge,
  type SSHAgentResponse,
  type WalletAgentIdentity,
} from './wallet-to-ssh.js';

export {
  // SSH → Wallet
  extractEd25519Seed,
  extractOpenSSHEd25519Seed,
  deriveSecp256k1FromSSH,
  deriveWalletFromSSHKey,
  deriveBIP32MasterKey,
  deriveHardenedChild,
  deriveEthereumKeyFromSSH,
  deriveHDWalletFromSSH,
  createSSHTransactionSigner,
  deriveServiceWallet,
  deriveFromHardwareSignature,
  deriveChainKey,
  COIN_TYPES,
  type SSHDerivedWallet,
  type HDWalletSeed,
  type SSHTransactionSigner,
} from './ssh-to-wallet.js';
