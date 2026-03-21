// blocktalk — App UI
// MIT License
//
// Wallet-to-wallet messaging. No server. Messages signed by sender,
// verified by receiver. Transport agnostic — clipboard, QR, relay.

import { createMessage, encodeMessage, decodeMessage, verifyBlocktalkMessage, type BlocktalkMessage } from './message';
import { getMessages, saveMessage, getConversation, getContacts, addContact, removeContact } from './store';

// Inject styles
const style = document.createElement('style');
style.textContent = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1e2030; color: #cdd6f4; height: 100vh; overflow: hidden; }
#app { height: 100vh; display: flex; flex-direction: column; }
.bt-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; background: #262840; border-bottom: 1px solid #3b3f5c; }
.bt-title { font-size: 15px; font-weight: 700; color: #cba6f7; letter-spacing: 1.5px; font-family: monospace; }
.bt-sub { font-size: 10px; color: #7f849c; letter-spacing: 0.8px; text-transform: uppercase; }
.bt-addr { font-family: monospace; font-size: 12px; color: #a6e3a1; padding: 3px 8px; background: rgba(166,227,161,0.1); border-radius: 6px; border: 1px solid rgba(166,227,161,0.2); }
.bt-body { display: flex; flex: 1; overflow: hidden; }
.bt-sidebar { width: 280px; min-width: 280px; border-right: 1px solid #3b3f5c; background: #232540; display: flex; flex-direction: column; overflow-y: auto; }
.bt-section { padding: 14px 16px; border-bottom: 1px solid #3b3f5c; }
.bt-section h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px; color: #7f849c; margin-bottom: 10px; font-weight: 600; }
.bt-input { width: 100%; padding: 8px 10px; background: #2a2d48; border: 1px solid #3b3f5c; border-radius: 6px; color: #e0e4f7; font-size: 13px; font-family: monospace; outline: none; margin-bottom: 6px; }
.bt-input:focus { border-color: #89b4fa; }
.bt-input::placeholder { color: #7f849c; opacity: 0.7; }
textarea.bt-input { resize: vertical; min-height: 60px; font-size: 11px; }
.bt-btn { width: 100%; padding: 9px; border: 1px solid #3b3f5c; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; margin-top: 6px; background: #89b4fa; color: #11111b; border-color: #89b4fa; }
.bt-btn:hover { filter: brightness(1.15); }
.bt-btn-secondary { background: #363a56; color: #cdd6f4; border-color: #3b3f5c; }
.bt-btn-metamask { background: linear-gradient(135deg, #e2761b, #cd6116); color: #fff; border-color: #e2761b; font-weight: 700; }
.bt-btn-danger { background: transparent; border: 1px solid #f38ba8; color: #f38ba8; }
.bt-btn-danger:hover { background: #f38ba8; color: #11111b; }
.bt-contact { padding: 8px 10px; margin-bottom: 3px; border-radius: 6px; cursor: pointer; transition: all 0.15s; border-left: 3px solid transparent; display: flex; justify-content: space-between; align-items: center; }
.bt-contact:hover { background: #262840; }
.bt-contact.active { background: #2e3150; border-left-color: #cba6f7; }
.bt-contact-name { font-size: 13px; font-weight: 500; color: #e0e4f7; }
.bt-contact-addr { font-size: 11px; color: #7f849c; font-family: monospace; }
.bt-contact-rm { background: none; border: none; color: #3b3f5c; cursor: pointer; font-size: 14px; padding: 2px 6px; }
.bt-contact-rm:hover { color: #f38ba8; }
.bt-main { flex: 1; display: flex; flex-direction: column; background: #1e2030; }
.bt-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.bt-msg { max-width: 80%; padding: 10px 14px; border-radius: 12px; font-size: 13px; line-height: 1.5; word-break: break-word; }
.bt-msg.sent { align-self: flex-end; background: #363a56; color: #e0e4f7; border-bottom-right-radius: 4px; }
.bt-msg.received { align-self: flex-start; background: #2e3150; color: #cdd6f4; border-bottom-left-radius: 4px; }
.bt-msg.invite { border: 1px solid #cba6f7; background: rgba(203,166,247,0.08); }
.bt-msg-meta { font-size: 10px; color: #7f849c; margin-top: 4px; }
.bt-msg-verify { font-size: 10px; color: #a6e3a1; }
.bt-msg-verify.invalid { color: #f38ba8; }
.bt-compose { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid #3b3f5c; background: #262840; }
.bt-compose input { flex: 1; }
.bt-compose button { width: auto; padding: 8px 20px; margin-top: 0; }
.bt-placeholder { flex: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 8px; color: #7f849c; }
.bt-placeholder-title { font-size: 24px; font-weight: 700; color: #cdd6f4; opacity: 0.4; font-family: monospace; letter-spacing: 2px; }
.bt-status { height: 30px; display: flex; align-items: center; padding: 0 20px; background: #262840; border-top: 1px solid #3b3f5c; font-size: 11px; font-family: monospace; color: #7f849c; }
`;
document.head.appendChild(style);

let walletClient: any = null;
let myAddress: string | null = null;
let activeContact: string | null = null;

function mk(tag: string, cls = '', html = ''): HTMLElement {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e;
}

export function createApp(): HTMLElement {
  const root = mk('div');
  root.style.cssText = 'display:flex;flex-direction:column;height:100vh';

  // Header
  const header = mk('div', 'bt-header', `
    <div><div class="bt-title">blocktalk</div><div class="bt-sub">wallet-to-wallet messaging</div></div>
    <div id="bt-addr-display"></div>
  `);

  const body = mk('div', 'bt-body');
  const sidebar = mk('div', 'bt-sidebar');
  const main = mk('div', 'bt-main');

  // Wallet section
  const walletSection = mk('div', 'bt-section', '<h3>Wallet</h3>');
  const connectBtn = document.createElement('button');
  connectBtn.className = 'bt-btn bt-btn-metamask';
  connectBtn.textContent = '🦊 Connect MetaMask';
  connectBtn.addEventListener('click', handleConnect);
  walletSection.appendChild(connectBtn);

  // Contacts section
  const contactsSection = mk('div', 'bt-section', '<h3>Contacts</h3>');
  const contactsList = mk('div');
  const addContactIn = document.createElement('input');
  addContactIn.className = 'bt-input'; addContactIn.placeholder = '0x address';
  const addContactName = document.createElement('input');
  addContactName.className = 'bt-input'; addContactName.placeholder = 'Name';
  const addContactBtn = document.createElement('button');
  addContactBtn.className = 'bt-btn bt-btn-secondary'; addContactBtn.textContent = 'Add Contact';
  addContactBtn.addEventListener('click', () => {
    if (!addContactIn.value.startsWith('0x')) return;
    addContact(addContactIn.value, addContactName.value || addContactIn.value.slice(0, 10));
    addContactIn.value = ''; addContactName.value = '';
    renderContacts();
  });
  contactsSection.append(contactsList, addContactIn, addContactName, addContactBtn);

  // Receive section
  const receiveSection = mk('div', 'bt-section', '<h3>Receive Message</h3>');
  const pasteIn = document.createElement('textarea');
  pasteIn.className = 'bt-input'; pasteIn.placeholder = 'Paste signed message JSON...';
  const receiveBtn = document.createElement('button');
  receiveBtn.className = 'bt-btn bt-btn-secondary'; receiveBtn.textContent = 'Import Message';
  receiveBtn.addEventListener('click', handleReceive);
  receiveSection.append(pasteIn, receiveBtn);

  sidebar.append(walletSection, contactsSection, receiveSection);

  // Main area
  const placeholder = mk('div', 'bt-placeholder', `
    <div class="bt-placeholder-title">blocktalk</div>
    <div>connect wallet → select contact → send message</div>
    <div style="font-size:11px;margin-top:12px;max-width:350px;text-align:center;color:#565f89">
      Messages are signed by your wallet and verified by the receiver.<br>
      No server. No account. Transport agnostic.
    </div>
  `);
  const messagesDiv = mk('div', 'bt-messages');
  messagesDiv.style.display = 'none';
  const composeDiv = mk('div', 'bt-compose');
  composeDiv.style.display = 'none';
  const composeIn = document.createElement('input');
  composeIn.className = 'bt-input'; composeIn.placeholder = 'Type a message...';
  composeIn.style.marginBottom = '0';
  const sendBtn = document.createElement('button');
  sendBtn.className = 'bt-btn'; sendBtn.textContent = 'Send';
  sendBtn.addEventListener('click', handleSend);
  composeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSend(); });
  composeDiv.append(composeIn, sendBtn);

  main.append(placeholder, messagesDiv, composeDiv);

  const status = mk('div', 'bt-status');
  status.textContent = 'not connected';

  body.append(sidebar, main);
  root.append(header, body, status);

  // Handlers
  async function handleConnect() {
    if (!(window as any).ethereum) { status.textContent = 'MetaMask not found'; return; }
    try {
      const { createWalletClient, custom } = await import('viem');
      const { mainnet } = await import('viem/chains');
      const ethereum = (window as any).ethereum;
      try { await ethereum.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }); } catch {}
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      if (!accounts.length) return;

      // Mandatory signature
      walletClient = createWalletClient({ chain: mainnet, transport: custom(ethereum) });
      const loginMsg = `blocktalk login\n\nTimestamp: ${Date.now()}\nSign to authenticate.`;
      await walletClient.signMessage({ account: accounts[0] as `0x${string}`, message: loginMsg });

      myAddress = accounts[0].toLowerCase();
      connectBtn.style.display = 'none';
      document.getElementById('bt-addr-display')!.innerHTML = `<span class="bt-addr">${myAddress.slice(0, 6)}...${myAddress.slice(-4)}</span>`;
      status.textContent = `connected: ${myAddress.slice(0, 10)}...`;
      renderContacts();
    } catch (e: any) {
      status.textContent = e.message;
    }
  }

  function renderContacts() {
    contactsList.innerHTML = '';
    for (const contact of getContacts()) {
      const item = mk('div', `bt-contact ${activeContact === contact.address ? 'active' : ''}`);
      item.innerHTML = `<div><div class="bt-contact-name">${contact.name}</div><div class="bt-contact-addr">${contact.address.slice(0, 10)}...</div></div>`;
      const rmBtn = document.createElement('button');
      rmBtn.className = 'bt-contact-rm'; rmBtn.textContent = '✕';
      rmBtn.addEventListener('click', (e) => { e.stopPropagation(); removeContact(contact.address); renderContacts(); });
      item.appendChild(rmBtn);
      item.addEventListener('click', () => { activeContact = contact.address; renderContacts(); showConversation(); });
      contactsList.appendChild(item);
    }
  }

  function showConversation() {
    if (!myAddress || !activeContact) return;
    placeholder.style.display = 'none';
    messagesDiv.style.display = '';
    composeDiv.style.display = '';
    messagesDiv.innerHTML = '';

    const msgs = getConversation(myAddress, activeContact);
    for (const msg of msgs) {
      const isSent = msg.from === myAddress;
      const bubble = mk('div', `bt-msg ${isSent ? 'sent' : 'received'} ${msg.type === 'share-invite' ? 'invite' : ''}`);
      bubble.innerHTML = `
        <div>${msg.type === 'share-invite' ? '📎 Share Invite: ' : ''}${msg.content.slice(0, 500)}</div>
        <div class="bt-msg-meta">${new Date(msg.timestamp).toLocaleTimeString()} · ${isSent ? 'sent' : msg.from.slice(0, 10)}</div>
      `;
      messagesDiv.appendChild(bubble);
    }
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  async function handleSend() {
    if (!myAddress || !activeContact || !walletClient) return;
    const text = composeIn.value.trim();
    if (!text) return;

    try {
      const { message, signable } = createMessage(myAddress, activeContact, text, 'text');
      const signature = await walletClient.signMessage({ account: myAddress as `0x${string}`, message: signable });
      const fullMsg: BlocktalkMessage = { ...message, signature };

      saveMessage(fullMsg);
      composeIn.value = '';
      showConversation();

      // Copy to clipboard for transmission
      await navigator.clipboard.writeText(encodeMessage(fullMsg));
      status.textContent = 'message signed & copied to clipboard';
    } catch (e: any) {
      status.textContent = `send failed: ${e.message}`;
    }
  }

  async function handleReceive() {
    const json = pasteIn.value.trim();
    if (!json) return;
    const msg = decodeMessage(json);
    if (!msg) { status.textContent = 'invalid message JSON'; return; }

    const valid = await verifyBlocktalkMessage(msg);
    if (!valid) { status.textContent = 'INVALID SIGNATURE — message may be tampered'; return; }

    saveMessage(msg);
    addContact(msg.from, msg.from.slice(0, 10));
    pasteIn.value = '';
    renderContacts();
    if (myAddress) {
      activeContact = msg.from;
      renderContacts();
      showConversation();
    }
    status.textContent = `message verified from ${msg.from.slice(0, 10)}...`;
  }

  return root;
}
