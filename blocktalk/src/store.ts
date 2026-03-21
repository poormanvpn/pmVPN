// blocktalk — Message store (localStorage)
// MIT License

import type { BlocktalkMessage } from './message';

const STORAGE_KEY = 'blocktalk-messages';
const CONTACTS_KEY = 'blocktalk-contacts';

export interface Contact {
  address: string;
  name: string;
  lastMessage: number; // timestamp
}

// ── Messages ──

export function getMessages(): BlocktalkMessage[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveMessage(msg: BlocktalkMessage): void {
  const messages = getMessages();
  // Dedup by nonce
  if (messages.find(m => m.nonce === msg.nonce)) return;
  messages.push(msg);
  // Keep last 500 messages
  if (messages.length > 500) messages.splice(0, messages.length - 500);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
}

export function getConversation(myAddress: string, theirAddress: string): BlocktalkMessage[] {
  const all = getMessages();
  const mine = myAddress.toLowerCase();
  const theirs = theirAddress.toLowerCase();
  return all
    .filter(m =>
      (m.from === mine && m.to === theirs) ||
      (m.from === theirs && m.to === mine) ||
      (m.from === theirs && m.to === '*')
    )
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function clearMessages(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Contacts ──

export function getContacts(): Contact[] {
  try {
    return JSON.parse(localStorage.getItem(CONTACTS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addContact(address: string, name: string): void {
  const contacts = getContacts();
  const existing = contacts.find(c => c.address.toLowerCase() === address.toLowerCase());
  if (existing) {
    existing.name = name;
    existing.lastMessage = Date.now();
  } else {
    contacts.push({ address: address.toLowerCase(), name, lastMessage: Date.now() });
  }
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
}

export function removeContact(address: string): void {
  const contacts = getContacts().filter(c => c.address.toLowerCase() !== address.toLowerCase());
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
}

export function updateContactTimestamp(address: string): void {
  const contacts = getContacts();
  const contact = contacts.find(c => c.address.toLowerCase() === address.toLowerCase());
  if (contact) {
    contact.lastMessage = Date.now();
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
  }
}
