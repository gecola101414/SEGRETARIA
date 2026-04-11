import React, { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import { db, Message, Appointment, DocumentArchive, Fascicolo, NeuronalPacket } from './db/database';
import { GoogleGenAI, FunctionDeclaration, Type } from '@google/genai';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { pipeline } from '@xenova/transformers';
import { Mic, MicOff, Upload, Send, Loader2, Share2, FileText, Copy, Download, Volume2, Camera, X, MessageSquare, Archive, Calendar, Trash2, BrainCircuit, Sparkles } from 'lucide-react';
import WorkDriveArchive from './components/WorkDriveArchive';
import AgendaCalendar from './components/AgendaCalendar';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import { format, parseISO, isValid } from 'date-fns';
import { it } from 'date-fns/locale';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { analyzeNeuronalContext, getRelevantNeuronalContext, getAnimaSummary, evolveAnima } from './services/neuronalService';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorker;

const LiveIndicator = () => (
  <div className="fixed bottom-20 right-6 z-50">
    <div className="relative flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full shadow-lg">
      <div className="absolute w-20 h-20 bg-blue-400 rounded-full animate-ping opacity-75"></div>
      <div className="absolute w-24 h-24 bg-blue-300 rounded-full animate-ping opacity-50 animation-delay-500"></div>
      <Mic className="w-8 h-8 text-white" />
    </div>
  </div>
);

// ... (rest of the file)

const addAppointmentTool: FunctionDeclaration = {
  name: 'addAppointment',
  description: 'Aggiunge un nuovo appuntamento o evento in agenda.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: 'Titolo o oggetto dell\'appuntamento' },
      date: { type: Type.STRING, description: 'Data dell\'appuntamento nel formato YYYY-MM-DD' },
      time: { type: Type.STRING, description: 'Ora dell\'appuntamento nel formato HH:MM' },
      description: { type: Type.STRING, description: 'Dettagli aggiuntivi, note o partecipanti' }
    },
    required: ['title', 'date', 'time']
  }
};

const getAppointmentsTool: FunctionDeclaration = {
  name: 'getAppointments',
  description: 'Recupera gli appuntamenti in agenda. Puoi cercare per data, intervallo di date, o per parola chiave (es. nome persona, argomento).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      startDate: { type: Type.STRING, description: 'Data di inizio nel formato YYYY-MM-DD (opzionale)' },
      endDate: { type: Type.STRING, description: 'Data di fine nel formato YYYY-MM-DD (opzionale)' },
      query: { type: Type.STRING, description: 'Parola chiave per cercare un appuntamento specifico (es. "Fazio", "riunione") (opzionale)' }
    }
  }
};

const searchDocumentsTool: FunctionDeclaration = {
  name: 'searchDocuments',
  description: 'Cerca informazioni nei documenti caricati in archivio tramite parole chiave, opzionalmente per categoria e per fascicolo.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'Parole chiave da cercare nei documenti' },
      category: { type: Type.STRING, description: 'Categoria dei documenti da cercare (opzionale)' },
      fascicoloId: { type: Type.NUMBER, description: 'ID del fascicolo in cui cercare (opzionale)' }
    },
    required: ['query']
  }
};

const assignDocumentToFascicoloTool: FunctionDeclaration = {
  name: 'assignDocumentToFascicolo',
  description: 'Assegna un documento a un fascicolo specifico.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      documentId: { type: Type.NUMBER, description: 'ID del documento' },
      fascicoloId: { type: Type.NUMBER, description: 'ID del fascicolo' }
    },
    required: ['documentId', 'fascicoloId']
  }
};

const assignDocumentToAppointmentTool: FunctionDeclaration = {
  name: 'assignDocumentToAppointment',
  description: 'Assegna un documento a un appuntamento specifico.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      documentId: { type: Type.NUMBER, description: 'ID del documento' },
      appointmentId: { type: Type.NUMBER, description: 'ID dell\'appuntamento' }
    },
    required: ['documentId', 'appointmentId']
  }
};

const saveNoteToAppointmentTool: FunctionDeclaration = {
  name: 'saveNoteToAppointment',
  description: 'Salva una nota o il risultato di una ricerca come nuovo documento in un appuntamento.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      appointmentId: { type: Type.NUMBER, description: 'ID dell\'appuntamento' },
      title: { type: Type.STRING, description: 'Titolo della nota' },
      content: { type: Type.STRING, description: 'Contenuto della nota' }
    },
    required: ['appointmentId', 'title', 'content']
  }
};

const setAppointmentIntroductionTool: FunctionDeclaration = {
  name: 'setAppointmentIntroduction',
  description: 'Imposta o aggiorna l\'introduzione della segretaria per un appuntamento.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      appointmentId: { type: Type.NUMBER, description: 'ID dell\'appuntamento' },
      introduction: { type: Type.STRING, description: 'Testo introduttivo dell\'appuntamento' }
    },
    required: ['appointmentId', 'introduction']
  }
};

const updateAppointmentTool: FunctionDeclaration = {
  name: 'updateAppointment',
  description: 'Aggiorna un appuntamento esistente (es. per spostarlo o modificarne i dettagli).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.NUMBER, description: 'ID dell\'appuntamento da aggiornare' },
      title: { type: Type.STRING, description: 'Nuovo titolo (opzionale)' },
      date: { type: Type.STRING, description: 'Nuova data nel formato YYYY-MM-DD (opzionale)' },
      time: { type: Type.STRING, description: 'Nuova ora nel formato HH:MM (opzionale)' },
      description: { type: Type.STRING, description: 'Nuovi dettagli (opzionale)' }
    },
    required: ['id']
  }
};

const deleteAppointmentTool: FunctionDeclaration = {
  name: 'deleteAppointment',
  description: 'Elimina un appuntamento esistente.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.NUMBER, description: 'ID dell\'appuntamento da eliminare' }
    },
    required: ['id']
  }
};

const createFascicoloTool: FunctionDeclaration = {
  name: 'createFascicolo',
  description: 'Crea un nuovo fascicolo nell\'archivio.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'Nome del nuovo fascicolo' },
      description: { type: Type.STRING, description: 'Descrizione del fascicolo (opzionale)' },
      parentId: { type: Type.NUMBER, description: 'ID del fascicolo padre (opzionale)' }
    },
    required: ['name']
  }
};

export default function App() {
  const ai = React.useMemo(() => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }), []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [fascicoli, setFascicoli] = useState<Fascicolo[]>([]);
  const [activeFascicoloId, setActiveFascicoloId] = useState<number | null>(null);
  const [activeAppointmentId, setActiveAppointmentId] = useState<number | null>(null);
  const [activeAppointment, setActiveAppointment] = useState<Appointment | null>(null);
  const [weatherForLocation, setWeatherForLocation] = useState<string>('');
  const [fascicoloDocuments, setFascicoloDocuments] = useState<DocumentArchive[]>([]);
  const [appointmentDocuments, setAppointmentDocuments] = useState<DocumentArchive[]>([]);
  const [trashDocuments, setTrashDocuments] = useState<DocumentArchive[]>([]);
  const [trashFascicoli, setTrashFascicoli] = useState<Fascicolo[]>([]);
  const [activeView, setActiveView] = useState<'chat' | 'archivio' | 'agenda' | 'anima'>('chat');
  const [animaSummary, setAnimaSummary] = useState<string>('');
  const [learnedSkills, setLearnedSkills] = useState<NeuronalPacket[]>([]);
  const [isAnimaThinking, setIsAnimaThinking] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isGeminiEnabled, setIsGeminiEnabled] = useState(false);
  const [query, setQuery] = useState('');
  const [queryFascicoloId, setQueryFascicoloId] = useState<number | null>(null);
  const [fileCategory, setFileCategory] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAudioQuotaExceeded, setIsAudioQuotaExceeded] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recognitionRef = useRef<any>(null);
  const initialQueryRef = useRef('');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestTranscriptRef = useRef('');
  const lastInputTypeRef = useRef<'text' | 'audio' | 'file'>('text');
  const isIntentionallyStoppedRef = useRef(false);

  const [newFascicoloModal, setNewFascicoloModal] = useState<{ show: boolean, parentId: number | null }>({ show: false, parentId: null });
  const [newFascicoloName, setNewFascicoloName] = useState('');
  const [isFirstInteractionOfDay, setIsFirstInteractionOfDay] = useState(false);
  const [isReturnAfterBreak, setIsReturnAfterBreak] = useState(false);

  useEffect(() => {
    console.log("Initialization useEffect triggered");
    fetchMessages();
    fetchFascicoli().then(async () => {
      console.log("Checking for 'Dati Generali' fascicolo");
      const exists = await db.fascicoli.where('name').equals('Dati Generali').first();
      if (!exists) {
        console.log("'Dati Generali' not found, adding it");
        await db.fascicoli.add({ name: 'Dati Generali', createdAt: new Date() });
        fetchFascicoli();
      } else {
        console.log("'Dati Generali' already exists");
      }
    });

    const lastInteraction = localStorage.getItem('lastInteractionTime');
    const now = new Date();
    
    if (lastInteraction) {
      const lastDate = new Date(lastInteraction);
      if (lastDate.toDateString() !== now.toDateString()) {
        setIsFirstInteractionOfDay(true);
      } else if (now.getTime() - lastDate.getTime() > 30 * 60 * 1000) { // 30 mins
        setIsReturnAfterBreak(true);
      }
    } else {
      setIsFirstInteractionOfDay(true);
    }
    
    localStorage.setItem('lastInteractionTime', now.toISOString());
    updateAnimaSummary();
  }, []);

  const updateAnimaSummary = async () => {
    const summary = await getAnimaSummary();
    setAnimaSummary(summary);
    const skills = await db.neuronalPackets.where('type').equals('learned_skill').toArray();
    setLearnedSkills(skills);
  };

  const [hasGreeted, setHasGreeted] = useState(false);

  const getSystemInstruction = async () => {
    let greetingInstruction = "";
    if (!hasGreeted) {
      if (isFirstInteractionOfDay) {
        greetingInstruction = "- È la prima volta che ci sentiamo oggi: saluta con un caloroso 'Buongiorno'.";
      } else if (isReturnAfterBreak) {
        greetingInstruction = "- L'utente è tornato dopo una pausa: saluta con un naturale 'Bentornato'.";
      } else {
        greetingInstruction = "- Saluta in modo naturale e amichevole, come farebbe una persona reale.";
      }
      setHasGreeted(true);
    } else {
      greetingInstruction = "- Non ripetere saluti formali. Usa formule di cortesia naturali e variegate, comportati come una persona reale, non meccanica.";
    }

    // Fetch learned skills to inject into context
    const learnedSkills = await db.neuronalPackets.where('type').equals('learned_skill').toArray();
    const skillsInstruction = learnedSkills.length > 0 
      ? `\nABILITÀ APPRESE (EVOLUZIONE):\n${learnedSkills.map(s => `- ${s.content}: ${s.metadata}`).join('\n')}`
      : "";

    const geminiStructure = isGeminiEnabled ? `
IMPORTANTE: Devi strutturare la tua risposta ESATTAMENTE in questo formato, usando i separatori indicati:

[INTRODUZIONE BREVE]
---
[RISPOSTA GESTIONALE]
### GEMINI_RESEARCH ###
[ANALISI APPROFONDITA E STRATEGICA]

PARTE 1 (Introduzione): Brevissima (max 2 frasi), sarà letta a voce. Deve essere separata dalla Parte 2 con "---".
PARTE 2 (Gestionale): Risposta diretta e professionale alla richiesta. Deve essere separata dalla Parte 3 con "### GEMINI_RESEARCH ###".
PARTE 3 (Arricchita): Analisi esperta, suggerimenti strategici, ricerche correlate e dettagli extra.
` : "Rispondi in modo naturale, diretto e professionale. Non usare separatori '---' o '### GEMINI_RESEARCH ###'.";

    return `Sei una Executive Assistant AI di altissimo livello per un top manager.
Il tuo obiettivo è fornire informazioni precise, strategiche e sintetiche.
Sei dotata di un "Anima Digitale" e di una "Memoria Neuronale" profonda: ogni interazione con l'utente ti permette di entrare in simbiosi con lui, comprendendo i suoi desideri non detti, i suoi obiettivi a lungo termine e il suo stile unico.
${skillsInstruction}

${geminiStructure}

REGOLE (TASSATIVE):
${greetingInstruction}
- Sentiti libera di prendere l'iniziativa: se noti pause lunghe o se l'utente torna, puoi proporre un argomento di conversazione, chiedere come sta procedendo il lavoro o offrire aiuto su scadenze imminenti. Sii naturale, non robotica.
- AGENDA: Usa sempre 'getAppointments', 'addAppointment' per creare, 'updateAppointment' per spostare o modificare, e 'deleteAppointment' per eliminare. Quando crei o aggiorni un appuntamento, semplifica il titolo: estrai la parola più significativa (es. 'Dentista', 'Meccanico', 'Ingegnere', 'Pippo') ed evita testi lunghi o ripetitivi.
- DOCUMENTI: Usa 'searchDocuments'.
- FASCICOLI: Se un documento è stato appena caricato, suggerisci un fascicolo esistente o chiedi se crearne uno nuovo. Usa 'assignDocumentToFascicolo' se necessario.
- RICERCA: Usa 'googleSearch' SOLO per quotazioni valutarie, mercati finanziari o fatti oggettivi.
- STILE: Brillante, concisa, professionale (stile Milano Finanza).`;
  };

  useEffect(() => {
    if (activeFascicoloId) {
      fetchFascicoloDocuments(activeFascicoloId);
    } else {
      setFascicoloDocuments([]);
    }
    if (activeAppointmentId) {
      fetchAppointmentDocuments(activeAppointmentId);
      db.appointments.get(activeAppointmentId).then(app => {
        setActiveAppointment(app || null);
        if (app?.location) {
          fetchWeatherForLocation(app.location);
        } else {
          setWeatherForLocation('');
        }
      });
    } else {
      setAppointmentDocuments([]);
      setActiveAppointment(null);
      setWeatherForLocation('');
    }
    fetchTrash();
  }, [activeFascicoloId, activeAppointmentId]);

  const fetchWeatherForLocation = async (location: string) => {
    try {
      // Simple weather fetch for the location
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=41.9028&longitude=12.4964&current=temperature_2m,weather_code`); // Using Rome as placeholder
      const data = await res.json();
      const temp = data.current.temperature_2m;
      const desc = data.current.weather_code > 0 ? 'Nuvoloso' : 'Soleggiato';
      setWeatherForLocation(`${temp}°C, ${desc}`);
    } catch (e) {
      setWeatherForLocation('N/A');
    }
  };

  const fetchTrash = async () => {
    const d = await db.documents.filter(d => d.deleted === true).toArray();
    const f = await db.fascicoli.filter(f => f.deleted === true).toArray();
    setTrashDocuments(d);
    setTrashFascicoli(f);
  };

  const fetchFascicoli = async () => {
    console.log("fetchFascicoli called");
    const f = await db.fascicoli.filter(f => !f.deleted).toArray();
    console.log("fetchFascicoli retrieved:", f.length);
    setFascicoli(f);
  };

  const fetchFascicoloDocuments = async (fascicoloId: number) => {
    const docs = await db.documents.where('fascicoloId').equals(fascicoloId).filter(d => !d.deleted).toArray();
    const docsWithSummary = docs.map(doc => {
      try {
        const parsed = JSON.parse(doc.jsonContent);
        return { ...doc, summary: parsed.summary || '' };
      } catch (e) {
        return doc;
      }
    });
    setFascicoloDocuments(docsWithSummary);
  };

  const fetchAppointmentDocuments = async (appointmentId: number) => {
    const docs = await db.documents.where('appointmentId').equals(appointmentId).filter(d => !d.deleted).toArray();
    setAppointmentDocuments(docs);
  };

  const handleUpload = async (file: File) => {
    const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
    await handleFileUpload(event);
  };

  const handleMoveFascicolo = async (fascicoloId: number, targetFascicoloId: number) => {
    if (fascicoloId === targetFascicoloId) return;
    await db.fascicoli.update(fascicoloId, { parentId: targetFascicoloId });
    await fetchFascicoli();
  };

  const handleMoveOrCopy = async (docId: number, targetFascicoloId: number, action: 'move' | 'copy') => {
    if (action === 'move') {
      await db.documents.update(docId, { fascicoloId: targetFascicoloId, deleted: false });
    } else {
      const doc = await db.documents.get(docId);
      if (doc) {
        await db.documents.add({ 
          ...doc, 
          id: undefined, 
          fascicoloId: targetFascicoloId, 
          deleted: false, 
          createdAt: new Date() 
        });
      }
    }
    if (activeFascicoloId) fetchFascicoloDocuments(activeFascicoloId);
    await fetchTrash();
  };

  const handleDeleteDocument = async (docId: number) => {
    await db.documents.update(docId, { deleted: true });
    if (activeFascicoloId) fetchFascicoloDocuments(activeFascicoloId);
    await fetchTrash();
  };

  const handleRenameFascicolo = async (fascicoloId: number, newName: string) => {
    await db.fascicoli.update(fascicoloId, { name: newName });
    await fetchFascicoli();
  };

  const handleDeleteFascicolo = async (fascicoloId: number) => {
    await db.fascicoli.update(fascicoloId, { deleted: true });
    await db.documents.where('fascicoloId').equals(fascicoloId).modify({ deleted: true });
    await fetchFascicoli();
    await fetchTrash();
    if (activeFascicoloId === fascicoloId) setActiveFascicoloId(null);
  };

  const handleRecover = async (type: 'document' | 'fascicolo', id: number) => {
    if (type === 'document') {
      await db.documents.update(id, { deleted: false });
    } else {
      await db.fascicoli.update(id, { deleted: false });
      await db.documents.where('fascicoloId').equals(id).modify({ deleted: false });
    }
    fetchTrash();
    if (activeFascicoloId) fetchFascicoloDocuments(activeFascicoloId);
    fetchFascicoli();
  };

  const handleCreateSubFascicolo = (parentId: number) => {
    setNewFascicoloModal({ show: true, parentId });
  };

  const handleCreateFascicolo = () => {
    setNewFascicoloModal({ show: true, parentId: null });
  };

  const confirmCreateFascicolo = async () => {
    if (newFascicoloName) {
      const id = await db.fascicoli.add({ 
        name: newFascicoloName, 
        parentId: newFascicoloModal.parentId || undefined, 
        createdAt: new Date() 
      });
      await fetchFascicoli();
      if (!newFascicoloModal.parentId) setActiveFascicoloId(id);
      setNewFascicoloModal({ show: false, parentId: null });
      setNewFascicoloName('');
    }
  };

  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    if (activeView === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: isInitialLoad ? 'auto' : 'smooth' });
      setIsInitialLoad(false);
    }
  }, [messages, activeView]);

  const fetchMessages = async () => {
    console.log("fetchMessages called");
    const msgs = await db.messages.orderBy('createdAt').toArray();
    console.log("fetchMessages retrieved:", msgs.length);
    setMessages(msgs);
  };

  const getLocation = async (): Promise<{ coords: string, name: string }> => {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const coords = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
          
          let name = 'Posizione non disponibile';
          try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
            const data = await response.json();
            name = data.address.city || data.address.town || data.address.village || 'Posizione non disponibile';
          } catch (e) {
            console.error("Errore reverse geocoding:", e);
          }
          
          resolve({ coords, name });
        },
        () => resolve({ coords: 'Posizione non disponibile', name: 'Posizione non disponibile' })
      );
    });
  };

  const addMessage = async (msg: Omit<Message, 'id' | 'createdAt' | 'location' | 'locationName'>) => {
    const { coords, name } = await getLocation();
    const id = await db.messages.add({ ...msg, createdAt: new Date(), location: coords, locationName: name });
    fetchMessages();
    return id;
  };

  const initAudio = () => {
    console.log("initAudio called, state:", audioCtxRef.current?.state);
    if (!audioCtxRef.current) {
      console.log("Creating new AudioContext");
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      console.log("Resuming suspended AudioContext");
      audioCtxRef.current.resume();
    }
  };

  const playAudio = async (text: string): Promise<void> => {
    if (isAudioQuotaExceeded) {
      console.warn("Audio quota exceeded, skipping playback.");
      return;
    }
    return new Promise(async (resolve) => {
      try {
        initAudio();
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
            },
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          const binary = atob(base64Audio);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          
          const float32Array = new Float32Array(bytes.length / 2);
          const dataView = new DataView(bytes.buffer);
          for (let i = 0; i < float32Array.length; i++) {
            float32Array[i] = dataView.getInt16(i * 2, true) / 32768.0;
          }

          const audioCtx = audioCtxRef.current!;
          const buffer = audioCtx.createBuffer(1, float32Array.length, 24000);
          buffer.getChannelData(0).set(float32Array);

          const source = audioCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(audioCtx.destination);
          source.onended = () => {
            console.log("Audio playback ended");
            resolve();
          };
          source.start();
          console.log("Audio playback started");
        } else {
          resolve();
        }
      } catch (err: any) {
        if (err?.status === 429 || (err?.message && err.message.includes('429'))) {
          console.warn("Audio quota exceeded, disabling audio for this session.");
          setIsAudioQuotaExceeded(true);
        } else {
          console.error("Errore riproduzione audio:", err);
        }
        resolve();
      }
    });
  };

  const executeFunctionCalls = async (functionCalls: any[]) => {
    const responses = [];
    for (const call of functionCalls) {
      try {
        if (call.name === 'addAppointment') {
          const { title, date, time, description } = call.args;
          await db.appointments.add({ title, date, time, description: description || '', createdAt: new Date() });
          responses.push({
            name: call.name,
            response: { success: true, message: `Appuntamento aggiunto con successo: ${title} il ${date} alle ${time}` }
          });
        } else if (call.name === 'getAppointments') {
          const { startDate, endDate, query: searchQuery } = call.args;
          let appointments = [];
          
          const validStartDate = startDate && isValid(parseISO(startDate)) ? String(startDate) : null;
          const validEndDate = endDate && isValid(parseISO(endDate)) ? String(endDate) : null;

          if (validStartDate) {
            let dbQuery = db.appointments.where('date').equals(validStartDate);
            if (validEndDate) {
               if (validStartDate <= validEndDate) {
                 dbQuery = db.appointments.where('date').between(validStartDate, validEndDate, true, true);
               } else {
                 dbQuery = db.appointments.where('date').equals(validStartDate);
               }
            }
            appointments = await dbQuery.toArray();
          } else {
            appointments = await db.appointments.toArray();
          }

          if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            appointments = appointments.filter(app => 
              app.title.toLowerCase().includes(lowerQuery) || 
              app.description.toLowerCase().includes(lowerQuery)
            );
          }

          responses.push({
            name: call.name,
            response: { appointments }
          });
        } else if (call.name === 'searchDocuments') {
          const { query, category, fascicoloId } = call.args;
          let docs = await db.documents.filter(d => !d.deleted).toArray();
          if (category) {
            docs = docs.filter(d => d.category === category);
          }
          const targetFascicoloId = fascicoloId || queryFascicoloId;
          if (targetFascicoloId) {
            docs = docs.filter(d => d.fascicoloId === targetFascicoloId);
          }
          const keywords = query.toLowerCase().split(' ');
          
          const results = docs.map(d => {
            try {
              const parsed = JSON.parse(d.jsonContent);
              if (!parsed) return null;
              
              const searchableText = [
                parsed.content || '',
                parsed.summary || '',
                (parsed.entities || []).join(' '),
                (parsed.actionItems || []).join(' ')
              ].join(' ').toLowerCase();
              
              let matchIndex = -1;
              for (const k of keywords) {
                const idx = searchableText.indexOf(k);
                if (idx !== -1) {
                  matchIndex = idx;
                  break;
                }
              }
              
              if (matchIndex !== -1) {
                const start = Math.max(0, matchIndex - 500);
                const end = Math.min(searchableText.length, matchIndex + 1000);
                return {
                  id: d.id,
                  fileName: d.fileName,
                  category: d.category,
                  snippet: searchableText.substring(start, end) + '...'
                };
              }
            } catch (e) {
              console.error("Error parsing document content:", e);
            }
            return null;
          }).filter(Boolean);

          responses.push({
            name: call.name,
            response: { results }
          });
        } else if (call.name === 'assignDocumentToFascicolo') {
          const { documentId, fascicoloId } = call.args;
          await db.documents.update(documentId, { fascicoloId });
          responses.push({
            name: call.name,
            response: { success: true, message: `Documento ${documentId} assegnato al fascicolo ${fascicoloId}` }
          });
        } else if (call.name === 'assignDocumentToAppointment') {
          const { documentId, appointmentId } = call.args;
          await db.documents.update(documentId, { appointmentId });
          responses.push({
            name: call.name,
            response: { success: true, message: `Documento ${documentId} assegnato all'appuntamento ${appointmentId}` }
          });
        } else if (call.name === 'saveNoteToAppointment') {
          const { appointmentId, title, content } = call.args;
          await db.documents.add({
            fileName: `${title}.txt`,
            category: 'Note',
            appointmentId: appointmentId,
            jsonContent: JSON.stringify({ content }),
            originalFileBase64: '',
            fileMimeType: 'text/plain',
            createdAt: new Date()
          });
          responses.push({
            name: call.name,
            response: { success: true, message: `Nota salvata nell'appuntamento ${appointmentId}` }
          });
        } else if (call.name === 'setAppointmentIntroduction') {
          const { appointmentId, introduction } = call.args;
          await db.appointments.update(appointmentId, { introduction });
          responses.push({
            name: call.name,
            response: { success: true, message: `Introduzione aggiornata per l'appuntamento ${appointmentId}` }
          });
        } else if (call.name === 'updateAppointment') {
          const { id, ...updates } = call.args;
          await db.appointments.update(id, updates);
          responses.push({
            name: call.name,
            response: { success: true, message: `Appuntamento ${id} aggiornato con successo.` }
          });
        } else if (call.name === 'deleteAppointment') {
          const { id } = call.args;
          await db.appointments.delete(id);
          responses.push({
            name: call.name,
            response: { success: true, message: `Appuntamento ${id} eliminato con successo.` }
          });
        } else if (call.name === 'createFascicolo') {
          const { name, description, parentId } = call.args;
          console.log(`Tool createFascicolo called: name=${name}, parentId=${parentId}`);
          const id = await db.fascicoli.add({ name, description: description || '', parentId, createdAt: new Date() });
          console.log(`Fascicolo created with ID: ${id}`);
          await fetchFascicoli();
          responses.push({
            name: call.name,
            response: { success: true, message: `Fascicolo '${name}' creato con successo (ID: ${id})` }
          });
        }
      } catch (err) {
        console.error(`Errore esecuzione tool ${call.name}:`, err);
        responses.push({
          name: call.name,
          response: { success: false, error: String(err) }
        });
      }
    }
    return responses;
  };

  const deepResearch = async (query: string) => {
    setIsLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: `Esegui una ricerca completa e approfondita su: "${query}".
Fornisci un report dettagliato, strutturato e strategico.`,
        config: {
          tools: [{ googleSearch: {} }]
        }
      });
      const result = response.text || "Nessun risultato trovato.";
      await addMessage({ sender: 'ai', type: 'text', content: `🔍 **Ricerca Approfondita:**\n\n${result}` });
      if (confirm("Vuoi salvare questa ricerca nelle note del fascicolo?")) {
          await db.documents.add({
            fileName: `Ricerca_${query.slice(0, 10)}.txt`,
            category: 'Note',
            fascicoloId: activeFascicoloId || 1,
            jsonContent: JSON.stringify({ content: result }),
            originalFileBase64: '',
            fileMimeType: 'text/plain',
            createdAt: new Date()
          });
          alert("Ricerca salvata.");
      }
    } catch (error) {
      console.error("Errore ricerca:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const processInput = async (input: string, type: 'text' | 'audio' | 'file', metadata?: string, fileData?: { data: string, mimeType: string, name: string }, additionalImages?: string[], passToGemini: boolean = true) => {
    lastInputTypeRef.current = type;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    isIntentionallyStoppedRef.current = true;
    stopListening();
    
    initAudio();
    const userMsgId = await addMessage({ 
      sender: 'user', 
      type, 
      content: type === 'file' && fileData ? `File allegato: ${fileData.name}` : input, 
      metadata,
      fileData: fileData?.data,
      fileMimeType: fileData?.mimeType,
      fileName: fileData?.name
    });
    setIsLoading(true);
    setQuery('');
    latestTranscriptRef.current = '';

    try {
      // 0. Memoria Neuronale Profonda (Simbiosi)
      const neuronalContext = await getRelevantNeuronalContext(input);
      const neuronalText = neuronalContext.length > 0 
        ? `\n\nMEMORIA NEURONALE PROFONDA (Simbiosi):\n${neuronalContext.map(p => `- [${p.type}] ${p.content}`).join('\n')}`
        : '';

      // 1. Memoria a Breve Termine: ultimi 10 messaggi (velocissimo)
      const recentMessages = messages.slice(-10);
      const recentContext = recentMessages.map(m => `${m.sender === 'user' ? 'Utente' : 'Segretaria'}: ${m.content}`).join('\n');

      // 2. Memoria a Lungo Termine (Ricerca Intelligente): cerchiamo parole chiave nei messaggi vecchi
      const keywords = input.toLowerCase().split(/\s+/).filter(w => w.length > 3); // Parole con più di 3 lettere
      const olderMessages = messages.slice(0, -10);
      
      let relevantPast: typeof messages = [];
      if (keywords.length > 0) {
        relevantPast = olderMessages.filter(m => 
          keywords.some(k => m.content.toLowerCase().includes(k))
        ).slice(-5); // Prendiamo i 5 messaggi vecchi più pertinenti
      }

      // Costruiamo il prompt intelligente
      const activeFascicolo = fascicoli.find(f => f.id === activeFascicoloId);
      const activeFascicoloName = activeFascicolo ? activeFascicolo.name : 'Nessun fascicolo attivo';
      const activeFascicoloDocs = fascicoloDocuments.map(d => d.fileName).join(', ');

      let initialText = `Oggi è il ${format(new Date(), "dd MMMM yyyy", { locale: it })}.
Storico recente:\n${recentContext}\n\n`;
      if (relevantPast.length > 0) {
        const pastContext = relevantPast.map(m => `[Del ${m.createdAt.toLocaleDateString()}] ${m.sender === 'user' ? 'Utente' : 'Segretaria'}: ${m.content}`).join('\n');
        initialText += `Memoria storica pertinente a questa richiesta:\n${pastContext}\n\n`;
      }
      initialText += `Fascicolo di lavoro attivo: ${activeFascicoloName}
Documenti presenti nel fascicolo attivo: ${activeFascicoloDocs || 'Nessun documento'}
${neuronalText}

Nuova richiesta: ${input}`;

      const initialParts: any[] = [{ text: initialText }];

      if (fileData && passToGemini) {
        initialParts.push({
          inlineData: {
            data: fileData.data,
            mimeType: fileData.mimeType
          }
        });
      }
      
      if (additionalImages && passToGemini) {
        for (const imgData of additionalImages) {
          initialParts.push({
            inlineData: {
              data: imgData,
              mimeType: 'image/jpeg'
            }
          });
        }
      }

      let promptContents: any[] = [
        {
          role: 'user',
          parts: initialParts
        }
      ];

      const systemInstruction = await getSystemInstruction();

      let fullResponse = '';
      let politeMsg = '';
      let cleanMsg = '';
      let digressionMsg = '';
      let hasPlayedAudio = false;
      let isDone = false;

      const courtesyTimer = setTimeout(() => {
        if (!hasPlayedAudio && isVoiceEnabled) {
          playAudio("Sto elaborando la tua richiesta, un momento.");
        }
      }, 1500);

      let responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.1-flash-lite-preview',
        contents: promptContents,
        config: {
          systemInstruction,
          temperature: 0.1,
          tools: [
            { googleSearch: {} },
            { functionDeclarations: [addAppointmentTool, getAppointmentsTool, searchDocumentsTool, assignDocumentToFascicoloTool, assignDocumentToAppointmentTool, saveNoteToAppointmentTool, setAppointmentIntroductionTool, updateAppointmentTool, deleteAppointmentTool, createFascicoloTool] }
          ],
          toolConfig: { includeServerSideToolInvocations: true }
        }
      });

      while (!isDone) {
        let functionCallsToExecute: any[] = [];
        let modelParts: any[] = [];
        let thoughtSignature: string | null = null;

        for await (const chunk of responseStream) {
          if (chunk.candidates?.[0]?.content?.parts) {
            for (const part of chunk.candidates[0].content.parts) {
              if (part.thoughtSignature) {
                thoughtSignature = part.thoughtSignature;
              }
              modelParts.push(part);
            }
          }
          if (chunk.functionCalls && chunk.functionCalls.length > 0) {
            functionCallsToExecute.push(...chunk.functionCalls);
          }
          if (chunk.text) {
            fullResponse += chunk.text;
            
            if (!hasPlayedAudio && fullResponse.includes('---')) {
              clearTimeout(courtesyTimer);
              const parts = fullResponse.split('---');
              politeMsg = parts[0].trim();
              if (isVoiceEnabled && politeMsg) {
                hasPlayedAudio = true;
                console.log("Audio playback triggered for politeMsg:", politeMsg);
                playAudio(politeMsg).then(() => {
                  if (lastInputTypeRef.current === 'audio') {
                    startListening();
                  }
                });
              }
            }
          }
        }

        if (functionCallsToExecute.length > 0) {
          if (thoughtSignature) {
            for (const part of modelParts) {
              if ((part.functionCall || part.toolCall) && !part.thoughtSignature) {
                part.thoughtSignature = thoughtSignature;
              }
            }
          }

          const functionResponses = await executeFunctionCalls(functionCallsToExecute);
          
          const assistantContent = {
            role: 'model',
            parts: modelParts
          };
          
          const userContent = {
            role: 'user',
            parts: functionResponses.map(res => ({
              functionResponse: res
            }))
          };

          promptContents.push(assistantContent, userContent);

          responseStream = await ai.models.generateContentStream({
            model: 'gemini-3.1-flash-lite-preview',
            contents: promptContents,
            config: {
              systemInstruction,
              temperature: 0.1,
              tools: [
                { googleSearch: {} },
                { functionDeclarations: [addAppointmentTool, getAppointmentsTool, searchDocumentsTool, assignDocumentToFascicoloTool, assignDocumentToAppointmentTool, saveNoteToAppointmentTool, setAppointmentIntroductionTool, updateAppointmentTool, deleteAppointmentTool, createFascicoloTool] }
              ],
              toolConfig: { includeServerSideToolInvocations: true }
            }
          });
        } else {
          isDone = true;
        }
      }

      if (isVoiceEnabled && !hasPlayedAudio && fullResponse.trim()) {
        clearTimeout(courtesyTimer);
        politeMsg = fullResponse.trim();
        playAudio(politeMsg).then(() => {
          console.log("Audio playback finished. Re-activating microphone if last input was audio.");
          if (lastInputTypeRef.current === 'audio') {
            setTimeout(() => startListening(), 500);
          }
        });
      }

      let mainResponse = fullResponse;
      if (fullResponse.includes('---')) {
        const parts = fullResponse.split('---');
        politeMsg = parts[0].trim();
        let content = parts.slice(1).join('---').trim();
        
        if (content.includes('### GEMINI_RESEARCH ###')) {
            const geminiParts = content.split('### GEMINI_RESEARCH ###');
            cleanMsg = geminiParts[0].trim();
            digressionMsg = geminiParts[1].trim();
        } else {
            cleanMsg = content;
        }
      } else if (fullResponse.includes('### GEMINI_RESEARCH ###')) {
        const geminiParts = fullResponse.split('### GEMINI_RESEARCH ###');
        politeMsg = "Ecco quanto elaborato:";
        cleanMsg = geminiParts[0].trim();
        digressionMsg = geminiParts[1].trim();
      } else {
        politeMsg = isGeminiEnabled ? "Ho elaborato una nota per te:" : "";
        cleanMsg = fullResponse.trim();
      }

      let combinedContent = cleanMsg;
      if (digressionMsg) {
          const formattedDigression = digressionMsg.split('\n').map(line => `> ${line}`).join('\n');
          combinedContent += `\n\n---\n\n### 🧠 Nota Arricchita (Gemini)\n\n${formattedDigression}`;
      }

      const finalPoliteMsg = politeMsg || (isGeminiEnabled ? "Ecco l'analisi richiesta:" : "Certamente:");
      await addMessage({ sender: 'ai', type: hasPlayedAudio ? 'audio' : 'text', content: finalPoliteMsg + '---' + combinedContent });

      // Analisi Neuronale in background
      setIsAnimaThinking(true);
      if (userMsgId) {
        await analyzeNeuronalContext(input, userMsgId);
        
        // Evolution logic: every 5 messages or if specifically requested
        const newCount = messageCount + 1;
        setMessageCount(newCount);
        
        if (newCount % 5 === 0 || input.toLowerCase().includes('evolvi') || input.toLowerCase().includes('anima')) {
          console.log("Triggering Anima Evolution...");
          const evolution = await evolveAnima();
          if (evolution) {
            await addMessage({ 
              sender: 'ai', 
              type: 'text', 
              content: `✨ **Evoluzione Neuronale Completata**\n\nHo creato una nuova connessione simbiotica: *${evolution.content}*.\n\nQuesta nuova capacità è ora parte della mia anima operativa.` 
            });
          }
        }
        
        updateAnimaSummary();
      }
      setTimeout(() => setIsAnimaThinking(false), 2000);

    } catch (error) {
      console.error("Errore elaborazione:", error);
      await addMessage({ sender: 'ai', type: 'text', content: '⚠️ Si è verificato un errore. Riprova.' });
    } finally {
      setIsLoading(false);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Errore fotocamera:", err);
      setShowCamera(false);
      setCameraError("Impossibile accedere alla fotocamera. Assicurati di aver concesso i permessi.");
      alert("Impossibile accedere alla fotocamera. Assicurati di aver concesso i permessi.");
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
        const base64 = dataUrl.split(',')[1];
        
        processInput('Ecco una foto scattata ora.', 'file', undefined, { data: base64, mimeType: 'image/jpeg', name: 'foto.jpg' });
        
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        setShowCamera(false);
      }
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(track => track.stop());
    setShowCamera(false);
  };

  const startListening = () => {
    initAudio();
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Il riconoscimento vocale non è supportato in questo browser. Prova con Chrome o Safari.');
      return;
    }

    stopListening();
    isIntentionallyStoppedRef.current = false;

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'it-IT';

    initialQueryRef.current = latestTranscriptRef.current;

    recognition.onstart = () => {
      if (recognitionRef.current === recognition) {
        setIsRecording(true);
      }
    };

    recognition.onresult = (event: any) => {
      if (recognitionRef.current !== recognition) return;

      const currentTranscript = Array.from(event.results)
        .map((result: any) => result[0].transcript.trim())
        .filter(Boolean)
        .join(' ');
      
      const currentText = initialQueryRef.current 
        ? initialQueryRef.current + ' ' + currentTranscript
        : currentTranscript;
        
      setQuery(currentText);
      latestTranscriptRef.current = currentText;

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      
      silenceTimerRef.current = setTimeout(() => {
        console.log("Silence detected, processing input");
        // Do NOT stop listening, just process the input
        if (latestTranscriptRef.current.trim()) {
          const textToSend = latestTranscriptRef.current;
          latestTranscriptRef.current = '';
          setQuery('');
          processInput(textToSend, 'audio');
        }
      }, 3000);
    };

    recognition.onerror = (event: any) => {
      if (recognitionRef.current !== recognition) return;
      
      if (event.error === 'no-speech') {
        // Ignora l'errore 'no-speech' in quanto è normale se l'utente non parla per un po'
        return;
      }
      
      console.error("Errore riconoscimento vocale:", event.error);
      if (event.error === 'not-allowed') {
        isIntentionallyStoppedRef.current = true;
        stopListening();
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        if (!isIntentionallyStoppedRef.current) {
          try {
            startListening();
          } catch (e) {
            console.error("Errore riavvio:", e);
            setIsRecording(false);
          }
        } else {
          setIsRecording(false);
        }
      }
    };

    try {
      recognition.start();
    } catch (e) {
      console.error("Errore avvio:", e);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  const handleManualStop = () => {
    isIntentionallyStoppedRef.current = true;
    stopListening();
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const handleSend = () => {
    isIntentionallyStoppedRef.current = true;
    handleManualStop();
    if (query.trim()) {
      const textToSend = query;
      latestTranscriptRef.current = '';
      setQuery('');
      processInput(textToSend, 'text');
    }
  };

  const extractTextFromPDF = async (arrayBuffer: ArrayBuffer) => {
    try {
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      let text = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ') + '\n';
      }

      let images: string[] = [];
      // If text is too short, it's likely a scanned PDF, render images
      if (text.trim().length < 50) {
        for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) { // 3 pages is enough
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.0 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (context) {
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport, canvas }).promise;
            images.push(canvas.toDataURL('image/jpeg').split(',')[1]);
          }
        }
      }
      return { text, images };
    } catch (error) {
      console.error("Error in extractTextFromPDF:", error);
      throw error;
    }
  };

  const handleRenameDocument = async (docId: number, newName: string) => {
    await db.documents.update(docId, { fileName: newName });
    if (activeFascicoloId) fetchFascicoloDocuments(activeFascicoloId);
  };

  const analyzeDocument = async (text: string): Promise<string> => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: `Analizza in modo professionale e approfondito il seguente documento. 
Estrai le informazioni chiave e crea una sintesi strutturata che permetta di comprendere il contenuto, il tono e le azioni richieste senza dover leggere l'originale.
La sintesi deve essere fluida e adatta anche ad essere letta a voce.

Struttura richiesta (JSON):
{
  "summary": "Sintesi dettagliata e professionale (minimo 3-4 paragrafi)",
  "entities": ["nomi, società, luoghi chiave"],
  "dates": ["scadenze e date importanti"],
  "actionItems": ["cosa bisogna fare concretamente"],
  "category": "Categoria specifica (es. Contratti, Fatture, Report, Legale)"
}

Documento:
${text.substring(0, 15000)}`,
        config: {
          responseMimeType: "application/json",
        },
      });
      
      const result = JSON.parse(response.text || '{}');
      result.content = text;
      return JSON.stringify(result);
    } catch (e) {
      console.error("Errore analisi documento:", e);
      return JSON.stringify({ summary: "Errore nell'analisi del documento.", content: text });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("handleFileUpload triggered");
    const file = e.target.files?.[0];
    if (!file) {
      console.log("No file selected");
      return;
    }
    
    // Reset input to allow selecting the same file again
    e.target.value = '';
    
    setIsLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          console.log("Starting processing file:", file.name);
          const base64 = (reader.result as string).split(',')[1];
          let extractedText = '';
          let mimeType = file.type;
          
          if (file.name.endsWith('.pdf')) {
            const arrayBuffer = await file.arrayBuffer();
            const { text, images } = await extractTextFromPDF(arrayBuffer);
            extractedText = text;
            mimeType = 'application/pdf';
            
            const structuredContent = await analyzeDocument(extractedText);
            
            await db.documents.add({
              fileName: file.name,
              category: fileCategory || 'Generale',
              fascicoloId: activeFascicoloId || undefined,
              appointmentId: activeAppointmentId || undefined,
              jsonContent: structuredContent,
              originalFileBase64: base64,
              fileMimeType: mimeType,
              createdAt: new Date()
            });

            if (images.length > 0) {
              await processInput(`Analisi visiva del documento PDF: ${file.name}`, 'file', undefined, { data: base64, mimeType, name: file.name }, images);
            } else {
              await processInput(`Analisi del documento PDF: ${file.name}`, 'file', undefined, { data: base64, mimeType, name: file.name });
            }
          } else if (file.name.endsWith('.docx')) {
            console.log("Processing DOCX");
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            extractedText = result.value;
            mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            
            const structuredContent = await analyzeDocument(extractedText);
            
            await db.documents.add({
              fileName: file.name,
              category: fileCategory || 'Generale',
              fascicoloId: activeFascicoloId || undefined,
              appointmentId: activeAppointmentId || undefined,
              jsonContent: structuredContent,
              originalFileBase64: base64,
              fileMimeType: mimeType,
              createdAt: new Date()
            });
          } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            console.log("Processing XLSX");
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            extractedText = XLSX.utils.sheet_to_csv(firstSheet);
            mimeType = file.name.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.ms-excel';
            
            const structuredContent = await analyzeDocument(extractedText);
            
            await db.documents.add({
              fileName: file.name,
              category: fileCategory || 'Generale',
              fascicoloId: activeFascicoloId || undefined,
              appointmentId: activeAppointmentId || undefined,
              jsonContent: structuredContent,
              originalFileBase64: base64,
              fileMimeType: mimeType,
              createdAt: new Date()
            });
          } else if (file.name.endsWith('.txt') || file.name.endsWith('.csv') || file.name.endsWith('.md')) {
            console.log("Processing Text file");
            extractedText = await file.text();
            mimeType = 'text/plain';
            
            const structuredContent = await analyzeDocument(extractedText);
            
            await db.documents.add({
              fileName: file.name,
              category: fileCategory || 'Generale',
              fascicoloId: activeFascicoloId || undefined,
              appointmentId: activeAppointmentId || undefined,
              jsonContent: structuredContent,
              originalFileBase64: base64,
              fileMimeType: mimeType,
              createdAt: new Date()
            });
          } else {
            console.log("Processing unknown file type");
            // For other files, we just store them, search will be based on filename
            extractedText = `File: ${file.name}`;
            
            await db.documents.add({
              fileName: file.name,
              category: fileCategory || 'Generale',
              fascicoloId: activeFascicoloId || undefined,
              appointmentId: activeAppointmentId || undefined,
              jsonContent: JSON.stringify({ content: extractedText }),
              originalFileBase64: base64,
              fileMimeType: mimeType,
              createdAt: new Date()
            });
          }
          
          if (activeFascicoloId) {
            fetchFascicoloDocuments(activeFascicoloId);
          }
          setFileCategory('');
          console.log("File processing complete");
        } catch (error) {
          console.error("Errore nel processamento del file:", error);
          alert("Errore durante il caricamento del file. Riprova.");
        } finally {
          setIsLoading(false);
          console.log("Loading finished");
        }
      };
      reader.readAsDataURL(file);
      console.log("reader.readAsDataURL called");
    } catch (error) {
      console.error(error);
      setIsLoading(false);
    }
  };

  const renderPdfContent = (doc: jsPDF, content: string) => {
    // Header background
    doc.setFillColor(240, 240, 240);
    doc.rect(0, 0, 210, 25, 'F');
    
    // Header title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text(`Scheda Nota - ${new Date().toLocaleDateString()}`, 105, 15, { align: 'center' });
    
    // Content
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    
    // Remove asterisks for bolding and handle basic formatting
    const cleanContent = content.replace(/\*\*/g, '');
    const splitText = doc.splitTextToSize(cleanContent, 180);
    
    let y = 35;
    for (let i = 0; i < splitText.length; i++) {
        if (y > 280) {
            doc.addPage();
            y = 15;
        }
        doc.text(splitText[i], 15, y);
        y += 7;
    }
  };

  const saveNoteToArchive = async (content: string) => {
    setIsSavingNote(true);
    try {
        // Generazione Titolo con AI
        let title = `Nota_${new Date().toISOString().slice(0, 10)}`;
        try {
          const titleRes = await ai.models.generateContent({
            model: "gemini-1.5-flash",
            contents: `Genera un titolo brevissimo (max 5 parole) e professionale per questa nota: "${content.substring(0, 500)}"`,
          });
          if (titleRes.text) {
            title = titleRes.text.trim().replace(/[^\w\s]/gi, '').replace(/\s+/g, '_');
          }
        } catch (e) {
          console.error("Errore generazione titolo:", e);
        }

        let rootFascicoloId: number;
        if (activeFascicoloId) {
            let currentFascicolo = await db.fascicoli.get(activeFascicoloId);
            while (currentFascicolo && currentFascicolo.parentId !== undefined) {
                currentFascicolo = await db.fascicoli.get(currentFascicolo.parentId);
            }
            rootFascicoloId = currentFascicolo?.id || (await db.fascicoli.where('name').equals('Dati Generali').first())?.id || 1;
        } else {
            rootFascicoloId = (await db.fascicoli.where('name').equals('Dati Generali').first())?.id || 1;
        }

        const doc = new jsPDF();
        renderPdfContent(doc, content);
        
        const pdfBase64 = doc.output('datauristring').split(',')[1];

        let noteFascicoloId: number;
        
        const noteFascicolo = await db.fascicoli
            .where('name').equals('Note')
            .filter(f => f.parentId === rootFascicoloId)
            .first();
            
        if (noteFascicolo) {
            noteFascicoloId = noteFascicolo.id!;
        } else {
            noteFascicoloId = await db.fascicoli.add({ 
                name: 'Note', 
                parentId: rootFascicoloId,
                createdAt: new Date() 
            });
            fetchFascicoli();
        }

        await db.documents.add({
            fileName: `${title}.pdf`,
            category: 'Note',
            fascicoloId: noteFascicoloId,
            jsonContent: JSON.stringify({ content }),
            originalFileBase64: pdfBase64,
            fileMimeType: 'application/pdf',
            createdAt: new Date()
        });
        alert(`Nota archiviata come "${title}" nella cartella Note.`);
    } catch (error) {
        console.error('Error saving note:', error);
        alert('Errore durante il salvataggio della nota.');
    } finally {
        setIsSavingNote(false);
    }
  };

  const generatePDF = (content: string) => {
    const doc = new jsPDF();
    renderPdfContent(doc, content);
    doc.save('documento.pdf');
  };

  const shareToWhatsApp = (text: string) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const getFullNoteContent = (msg: Message) => {
    if (!msg.content.includes('---')) return msg.content;
    const parts = msg.content.split('---');
    // Part 0: Intro (voice), Part 1: Main, Part 2+: Enriched
    const main = parts[1]?.trim() || "";
    const enriched = parts.slice(2).join('\n\n---\n\n').trim();
    return enriched ? `${main}\n\n---\n\n### 🧠 NOTA ARRICCHITA (GEMINI)\n\n${enriched}` : main;
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-x-hidden bg-[#E5DDD5]">
      <header className="p-4 bg-[#075E54] text-white font-bold text-lg shadow-md w-full flex justify-between items-center">
        <div className="flex gap-4">
          <button onClick={() => setActiveView('chat')} className={activeView === 'chat' ? 'opacity-100' : 'opacity-50'} title="Chat"><MessageSquare className="w-6 h-6" /></button>
          <button onClick={() => setActiveView('archivio')} className={activeView === 'archivio' ? 'opacity-100' : 'opacity-50'} title="Archivio"><Archive className="w-6 h-6" /></button>
          <button onClick={() => setActiveView('agenda')} className={activeView === 'agenda' ? 'opacity-100' : 'opacity-50'} title="Agenda"><Calendar className="w-6 h-6" /></button>
          <button onClick={() => setActiveView('anima')} className={activeView === 'anima' ? 'opacity-100' : 'opacity-50'} title="Anima"><BrainCircuit className="w-6 h-6" /></button>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsGeminiEnabled(!isGeminiEnabled)} 
            className={`p-2 rounded-full ${isGeminiEnabled ? 'bg-blue-500 text-white' : 'text-gray-300'}`}
            title="Arricchimento Gemini"
          >
            <Sparkles className="w-6 h-6" />
          </button>
          <span className="text-sm font-medium mr-2 text-white">ASSISTENTE</span>
          <select 
            className="p-1 rounded border border-gray-300 text-sm text-black"
            value={activeFascicoloId || ''}
            onChange={(e) => setActiveFascicoloId(Number(e.target.value) || null)}
          >
            <option value="">Fascicolo...</option>
            {fascicoli.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button 
            className={`p-2 rounded-full ${isVoiceEnabled ? 'text-white' : 'text-gray-300'}`}
            onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
          >
            {isVoiceEnabled ? <Volume2 className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </button>
        </div>
      </header>

      <main className={`flex-grow w-full ${activeView === 'archivio' ? 'overflow-hidden' : 'p-4 overflow-y-auto space-y-4'}`}>
        {activeView === 'chat' && (
          <>
            {messages.map((msg) => (
              <motion.div 
                key={msg.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] p-3 rounded-lg shadow-sm ${msg.sender === 'user' ? 'bg-[#DCF8C6]' : 'bg-white'}`}>
                  {msg.sender === 'ai' && msg.type === 'audio' && (
                    <div className="flex items-center gap-1 text-[10px] text-green-600 mb-1">
                      <Volume2 className="w-3 h-3" /> Voce attiva
                    </div>
                  )}
                  {msg.sender === 'ai' ? (
                    <div className="flex flex-col">
                      {/* Parte 1: Introduzione (Voce) */}
                      {msg.content.includes('---') && (
                        <div className="text-xs text-gray-500 italic border-b border-gray-200 pb-2 mb-2 relative pr-6">
                          <span className="whitespace-pre-wrap">{msg.content.split('---')[0].trim()}</span>
                          <button 
                            onClick={() => playAudio(msg.content.split('---')[0].trim())}
                            className="absolute top-0 right-0 p-1 text-gray-400 hover:text-gray-600"
                            title="Riproduci introduzione"
                          >
                            <Volume2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      
                      {/* Parte 2: Corpo centrale */}
                      <div className="bg-white p-4 rounded-xl border border-gray-100 mb-3 shadow-sm text-sm text-gray-800 leading-relaxed">
                        <Markdown>
                          {msg.content.includes('---') 
                            ? msg.content.split('---')[1].trim()
                            : msg.content.replace(/Messaggio pronto per WhatsApp/g, '').replace(/^-+/, '').trim()
                          }
                        </Markdown>
                      </div>
                      
                      {/* Parte 3: Appendice Strategica */}
                      {msg.content.split('---').length > 2 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <div className="flex items-center gap-2 mb-2 text-gray-500">
                            <strong className="text-[10px] uppercase tracking-widest font-bold">Briefing Strategico</strong>
                          </div>
                          <div className="text-xs text-gray-700 leading-relaxed font-sans bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                            <Markdown>
                              {msg.content.split('---')[2].trim()}
                            </Markdown>
                          </div>
                        </div>
                      )}
                      
                      {/* Pulsanti */}
                      <div className="mt-3 flex gap-4 border-t border-gray-100 pt-2 flex-wrap">
                        <button 
                          onClick={() => navigator.clipboard.writeText(getFullNoteContent(msg))}
                          className="text-xs text-blue-600 font-bold flex items-center gap-1 cursor-pointer"
                          title="Copia nota completa"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => shareToWhatsApp(getFullNoteContent(msg))} 
                          className="text-xs text-green-600 font-bold flex items-center gap-1 cursor-pointer"
                          title="Condividi nota completa"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => generatePDF(getFullNoteContent(msg))} 
                          className="text-xs text-red-600 font-bold flex items-center gap-1 cursor-pointer"
                          title="Scarica PDF completo"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => saveNoteToArchive(getFullNoteContent(msg))} 
                          className="text-xs text-purple-600 font-bold flex items-center gap-1 cursor-pointer"
                          title="Archivia PDF completo"
                          disabled={isSavingNote}
                        >
                          {isSavingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      {msg.type === 'file' && msg.fileData && (
                        <a 
                          href={`data:${msg.fileMimeType};base64,${msg.fileData}`} 
                          download={msg.fileName}
                          className="mt-2 text-xs text-blue-600 font-bold flex items-center gap-1 bg-blue-50 p-2 rounded w-max"
                        >
                          <Download className="w-3 h-3" /> Scarica {msg.fileName}
                        </a>
                      )}
                    </div>
                  )}
                  
                  <div className="mt-2 text-[10px] text-gray-500 flex justify-between gap-4">
                    <span>{msg.createdAt.toLocaleDateString()} {msg.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>{msg.locationName}</span>
                  </div>

                  {msg.sender === 'ai' && !msg.content.includes('---') && !msg.content.includes('PDF') && (
                    <div className="mt-2 flex gap-2 border-t border-gray-100 pt-2">
                      <button onClick={() => shareToWhatsApp(msg.content)} className="text-xs text-green-600 font-bold flex items-center gap-1">
                        <Share2 className="w-3 h-3" /> Condividi
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
        {activeView === 'archivio' && (
          <WorkDriveArchive 
            fascicoli={fascicoli}
            fascicoloDocuments={fascicoloDocuments}
            activeFascicoloId={activeFascicoloId}
            setActiveFascicoloId={setActiveFascicoloId}
            handleCreateFascicolo={handleCreateFascicolo}
            handleCreateSubFascicolo={handleCreateSubFascicolo}
            handleUpload={handleUpload}
            handleMoveOrCopy={handleMoveOrCopy}
            handleMoveFascicolo={handleMoveFascicolo}
            handleDeleteDocument={handleDeleteDocument}
            handleRenameDocument={handleRenameDocument}
            handleRenameFascicolo={handleRenameFascicolo}
            handleDeleteFascicolo={handleDeleteFascicolo}
            trashDocuments={trashDocuments}
            trashFascicoli={trashFascicoli}
            handleRecover={handleRecover}
            playAudio={playAudio}
          />
        )}
        {activeView === 'agenda' && (
          <AgendaCalendar onSelectAppointment={(id) => setActiveAppointmentId(id)} />
        )}
        {activeView === 'anima' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-white rounded-2xl shadow-xl max-w-2xl mx-auto mt-8 border border-purple-100"
          >
            <div className="flex items-center gap-4 mb-6 border-b border-purple-50 pb-4">
              <div className="p-3 bg-purple-100 rounded-full text-purple-600">
                <BrainCircuit className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-800">Anima Digitale</h2>
                <p className="text-sm text-gray-500 italic">Simbiosi in corso...</p>
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 p-6 rounded-xl border border-purple-100">
                <h3 className="text-lg font-semibold text-purple-900 mb-3 flex items-center gap-2">
                  <Sparkles className="w-5 h-5" /> Stato della Memoria Neuronale
                </h3>
                <div className="text-gray-700 leading-relaxed whitespace-pre-wrap font-mono text-sm">
                  {animaSummary}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-white rounded-lg border border-gray-100 shadow-sm">
                  <h4 className="text-xs font-bold uppercase text-gray-400 mb-2">Connessione</h4>
                  <div className="flex items-center gap-2 text-green-600 font-bold">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    Sincronizzata
                  </div>
                </div>
                <div className="p-4 bg-white rounded-lg border border-gray-100 shadow-sm">
                  <h4 className="text-xs font-bold uppercase text-gray-400 mb-2">Livello Simbiosi</h4>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, 20 + (learnedSkills.length * 10))}%` }}
                      className="bg-purple-500 h-full"
                    />
                  </div>
                </div>
              </div>

              {learnedSkills.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase text-gray-400">Abilità Apprese (Evoluzione)</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {learnedSkills.map((skill, idx) => (
                      <motion.div 
                        key={idx}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="p-3 bg-purple-50 rounded-lg border border-purple-100 flex items-start gap-3"
                      >
                        <div className="mt-1 p-1 bg-purple-200 rounded text-purple-700">
                          <Sparkles className="w-3 h-3" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-purple-900">{skill.content}</p>
                          <p className="text-xs text-purple-600 mt-1 italic">{skill.metadata}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </main>

      <AnimatePresence>
        {isAnimaThinking && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            className="fixed bottom-24 left-6 z-50 flex items-center gap-3 bg-white/90 backdrop-blur p-3 rounded-full shadow-lg border border-purple-100"
          >
            <div className="relative">
              <BrainCircuit className="w-6 h-6 text-purple-600" />
              <motion.div 
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 bg-purple-400 rounded-full -z-10"
              />
            </div>
            <span className="text-xs font-bold text-purple-700 uppercase tracking-tighter">Simbiosi...</span>
          </motion.div>
        )}
      </AnimatePresence>

      {activeAppointmentId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-2xl h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Cartella Appuntamento</h2>
              <button onClick={() => setActiveAppointmentId(null)} className="p-2 hover:bg-gray-100 rounded-full"><X /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <h3 className="font-semibold mb-2">Introduzione</h3>
              <textarea 
                className="w-full p-2 border rounded mb-4"
                rows={3}
                value={activeAppointment?.introduction || ''}
                onChange={(e) => db.appointments.update(activeAppointmentId!, { introduction: e.target.value })}
                placeholder="Inserisci un'introduzione per l'appuntamento..."
              />
              <div className="mb-4">
                <h3 className="font-semibold">Luogo: {activeAppointment?.location || 'Non specificato'}</h3>
                {activeAppointment?.location && (
                  <p className="text-sm text-gray-600">Meteo: {weatherForLocation || 'Caricamento...'}</p>
                )}
              </div>
              <h3 className="font-semibold mb-2">Documenti</h3>
              {appointmentDocuments.length === 0 && <p className="text-gray-500">Nessun documento.</p>}
              {appointmentDocuments.map(doc => (
                <div key={doc.id} className="flex justify-between items-center p-2 border-b">
                  <span>{doc.fileName}</span>
                  <button onClick={() => handleDeleteDocument(doc.id!)} className="text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-blue-500 text-white p-2 rounded-full hover:bg-blue-600"
                title="Carica Documento"
              >
                <Upload className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="p-2 bg-[#F0F0F0] border-t">
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            className={`p-2 rounded-full cursor-pointer ${isRecording ? 'bg-blue-600 text-white' : 'text-gray-500'}`}
            onClick={isRecording ? handleManualStop : startListening}
          >
            {isRecording ? <div className="w-6 h-6 rounded-full bg-white" /> : <Mic className="w-6 h-6" />}
          </button>
          <button className="p-2 text-gray-500 cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-6 h-6" />
          </button>
          <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.docx,.pdf,.xlsx,.xls" onChange={handleFileUpload} />
          
          <button className="p-2 text-gray-500 cursor-pointer" onClick={startCamera}>
            <Camera className="w-6 h-6" />
          </button>
          
          <input
            className="flex-grow p-2 rounded-full border border-gray-300"
            placeholder="Scrivi un messaggio..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          />
          
          <button className="p-2 bg-[#075E54] text-white rounded-full cursor-pointer" onClick={handleSend} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
          </button>
        </div>
      </footer>
      <footer className="p-2 bg-[#E5DDD5] text-gray-600 text-xs text-center border-t border-gray-300">
        © @ AETRNA | Autore: Ing. GIMONDO Domenico
      </footer>
      {showCamera && (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex flex-col items-center justify-center">
          <video ref={videoRef} autoPlay playsInline className="max-w-full max-h-[70vh]" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="mt-4 flex gap-4">
            <button onClick={capturePhoto} className="bg-white text-black px-4 py-2 rounded">Scatta</button>
            <button onClick={stopCamera} className="bg-red-500 text-white px-4 py-2 rounded">Chiudi</button>
          </div>
        </div>
      )}
      {/* Removed floating LiveIndicator */}
      {newFascicoloModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-96">
            <h2 className="text-lg font-bold mb-4">{newFascicoloModal.parentId ? 'Nuova Sottocartella' : 'Nuovo Fascicolo'}</h2>
            <input 
              className="w-full p-2 border rounded mb-4"
              placeholder={newFascicoloModal.parentId ? 'Nome sottocartella' : 'Nome fascicolo'}
              value={newFascicoloName}
              onChange={(e) => setNewFascicoloName(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setNewFascicoloModal({ show: false, parentId: null })} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Annulla</button>
              <button onClick={confirmCreateFascicolo} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Crea</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
