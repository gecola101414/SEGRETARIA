import Dexie, { Table } from 'dexie';

export interface Message {
  id?: number;
  sender: 'user' | 'ai';
  type: 'text' | 'audio' | 'file';
  content: string; // The text content or transcript
  metadata?: string; // e.g., filename or original audio name
  createdAt: Date;
  location?: string; // Added location field
}

class SmartSecretaryDB extends Dexie {
  messages!: Table<Message>;

  constructor() {
    super('SmartSecretaryDB');
    this.version(2).stores({
      messages: '++id, sender, type, createdAt'
    });
  }
}

export const db = new SmartSecretaryDB();
