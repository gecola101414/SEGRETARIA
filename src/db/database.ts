import Dexie, { Table } from 'dexie';

export interface Message {
  id?: number;
  sender: 'user' | 'ai';
  type: 'text' | 'audio' | 'file';
  content: string; // The text content or transcript
  metadata?: string; // e.g., filename or original audio name
  createdAt: Date;
  location?: string; // Raw coordinates
  locationName?: string; // Municipality name
  fileData?: string; // base64 string for downloading
  fileMimeType?: string;
  fileName?: string;
}

export interface Fascicolo {
  id?: number;
  name: string;
  description?: string;
  createdAt: Date;
  deleted?: boolean;
  parentId?: number; // Added for sub-folders
}

export interface Appointment {
  id?: number;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  description: string;
  location?: string; // Location for weather
  introduction?: string; // Introduzione della segretaria
  createdAt: Date;
}

export interface Weather {
  id?: number;
  date: string; // YYYY-MM-DD
  location: string;
  forecast: string;
  createdAt: Date;
}

export interface DocumentArchive {
  id?: number;
  fileName: string;
  category: string; // Thematic area
  fascicoloId?: number; // Link to Fascicolo
  appointmentId?: number; // Link to Appointment
  jsonContent: string; // JSON string
  originalFileBase64: string; // base64 string
  fileMimeType: string;
  createdAt: Date;
  deleted?: boolean;
  summary?: string; // Added summary field
}

class SmartSecretaryDB extends Dexie {
  messages!: Table<Message>;
  appointments!: Table<Appointment>;
  documents!: Table<DocumentArchive>;
  fascicoli!: Table<Fascicolo>;
  weather!: Table<Weather>;

  constructor() {
    super('SmartSecretaryDB');
    this.version(10).stores({
      messages: '++id, sender, type, createdAt',
      appointments: '++id, date, time',
      documents: '++id, fileName, category, fascicoloId, deleted',
      fascicoli: '++id, name, deleted',
      weather: '++id, date, location'
    });
  }
}

export const db = new SmartSecretaryDB();
