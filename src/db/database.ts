import Dexie, { Table } from 'dexie';

export interface Message {
  id?: number;
  sender: 'user' | 'ai';
  type: 'text' | 'audio' | 'file';
  content: string; // The text content or transcript
  metadata?: string; // e.g., filename or original audio name
  createdAt: Date;
  location?: string; // Added location field
  fileData?: string; // base64 string for downloading
  fileMimeType?: string;
  fileName?: string;
}

export interface Appointment {
  id?: number;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  description: string;
  createdAt: Date;
}

export interface DocumentArchive {
  id?: number;
  fileName: string;
  textContent: string;
  createdAt: Date;
}

class SmartSecretaryDB extends Dexie {
  messages!: Table<Message>;
  appointments!: Table<Appointment>;
  documents!: Table<DocumentArchive>;

  constructor() {
    super('SmartSecretaryDB');
    this.version(4).stores({
      messages: '++id, sender, type, createdAt',
      appointments: '++id, date, time',
      documents: '++id, fileName'
    });
  }
}

export const db = new SmartSecretaryDB();
