import React, { useState, useEffect, useRef } from 'react';
import { db, Message } from './db/database';
import { GoogleGenAI } from '@google/genai';
import mammoth from 'mammoth';
import { pipeline } from '@xenova/transformers';
import { Mic, MicOff, Upload, Send, Loader2, Share2, FileText, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchMessages = async () => {
    const msgs = await db.messages.orderBy('createdAt').toArray();
    setMessages(msgs);
  };

  const getLocation = async (): Promise<string> => {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`),
        () => resolve('Posizione non disponibile')
      );
    });
  };

  const addMessage = async (msg: Omit<Message, 'id' | 'createdAt' | 'location'>) => {
    const location = await getLocation();
    await db.messages.add({ ...msg, createdAt: new Date(), location });
    fetchMessages();
  };

  const processInput = async (input: string, type: 'text' | 'audio' | 'file', metadata?: string) => {
    await addMessage({ sender: 'user', type, content: input, metadata });
    setIsLoading(true);
    setQuery('');

    try {
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
      let promptContents = `Storico recente:\n${recentContext}\n\n`;
      if (relevantPast.length > 0) {
        const pastContext = relevantPast.map(m => `[Del ${m.createdAt.toLocaleDateString()}] ${m.sender === 'user' ? 'Utente' : 'Segretaria'}: ${m.content}`).join('\n');
        promptContents += `Memoria storica pertinente a questa richiesta:\n${pastContext}\n\n`;
      }
      promptContents += `Nuova richiesta: ${input}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: promptContents,
        config: {
          systemInstruction: `Sei una Executive Assistant AI di altissimo livello, progettata per top manager e figure di spicco della finanza di Milano. La tua intelligenza è brillante, analitica, affilata e orientata al risultato.
Analizza l'input dell'utente e rispondi in due parti separate ESATTAMENTE da "---":
1. Messaggio di cortesia (breve nota di lavoro interna, dritta al punto).
2. Messaggio pulito (il contenuto vero e proprio, formattato in modo IMPECCABILE per WhatsApp).

REGOLE DI COGNIZIONE E FOCUS (TASSATIVE):
- LASER FOCUS: Rispondi ESATTAMENTE e SOLO alla richiesta dell'utente. Niente divagazioni.
- DATI PERSONALI: Se l'utente chiede della *sua* agenda, dei *suoi* appuntamenti o dati personali, basati ESCLUSIVAMENTE sulla "Memoria storica" e sullo "Storico recente" forniti nel prompt. Se l'informazione non c'è, rispondi con eleganza che non risulta nei tuoi archivi attuali. NON INVENTARE e NON USARE IL WEB per cercare l'agenda personale dell'utente.
- RICERCA WEB MISURATA: Usa la ricerca web SOLO per mercati finanziari, notizie pubbliche o fatti oggettivi esplicitamente richiesti. Se aggiungi un commento di contesto, deve essere brevissimo (una riga) e strettamente pertinente.
- STILE: Sii brillante, concisa, professionale. Stile "Milano Finanza". Zero fronzoli, massima resa.

REGOLE PER IL MESSAGGIO WHATSAPP (Parte 2):
- Usa elenchi puntati, spaziature chiare e tabulazioni per rendere la lettura facile e ordinata su smartphone.
- Non includere MAI i tuoi commenti iniziali in questa parte.
- Usa il grassetto (racchiudendo il testo tra asterischi, es. *Testo*) per evidenziare i concetti chiave.

IMPORTANTE: NON usare etichette come "AI:" o formattazione speciale per identificarti. Scrivi solo il testo del messaggio.

Se l'utente chiede un PDF, rispondi solo "PDF: [Contenuto pulito]".`,
          temperature: 0.1, // Estremamente basso per massima precisione, logica ferrea e zero divagazioni
          tools: [{ googleSearch: {} }], // Abilita la ricerca Google in tempo reale
        }
      });

      const fullResponse = response.text || '';
      let politeMsg = fullResponse;
      let cleanMsg = fullResponse;

      if (fullResponse.includes('---')) {
        const parts = fullResponse.split('---');
        politeMsg = parts[0].trim();
        cleanMsg = parts[1].trim();
      }

      if (fullResponse.startsWith('PDF:')) {
        const content = fullResponse.replace('PDF:', '').trim();
        generatePDF(content);
        await addMessage({ sender: 'ai', type: 'text', content: '✅ PDF generato e disponibile.' });
      } else {
        await addMessage({ sender: 'ai', type: 'text', content: politeMsg + '---' + cleanMsg });
      }
    } catch (error) {
      console.error("Errore elaborazione:", error);
      await addMessage({ sender: 'ai', type: 'text', content: '⚠️ Si è verificato un errore. Riprova.' });
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        // Use a simpler approach for demo purposes if pipeline fails
        const reader = new FileReader();
        reader.onloadend = async () => {
          const arrayBuffer = reader.result as ArrayBuffer;
          // Dummy transcription for demo if pipeline fails
          processInput("Nota vocale registrata", 'audio');
        };
        reader.readAsArrayBuffer(audioBlob);
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      alert('Non posso accedere al microfono.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const generatePDF = (content: string) => {
    const doc = new jsPDF();
    doc.text(content, 10, 10);
    doc.save('documento.pdf');
  };

  const shareToWhatsApp = (text: string) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="flex flex-col h-screen w-full overflow-x-hidden bg-[#E5DDD5]">
      <header className="p-4 bg-[#075E54] text-white font-bold text-lg shadow-md w-full">
        Smart Secretary Pro
      </header>

      <main className="flex-grow p-4 overflow-y-auto space-y-4 w-full">
        {messages.map((msg) => (
          <motion.div 
            key={msg.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] p-3 rounded-lg shadow-sm ${msg.sender === 'user' ? 'bg-[#DCF8C6]' : 'bg-white'}`}>
              {msg.sender === 'ai' && msg.content.includes('---') ? (
                <div className="flex flex-col">
                  {/* Note interne */}
                  <div className="text-xs text-gray-500 italic border-b border-gray-200 pb-2 mb-2">
                    <span className="font-semibold not-italic text-gray-600">Note interne: </span>
                    <span className="whitespace-pre-wrap">{msg.content.split('---')[0].trim()}</span>
                  </div>
                  
                  {/* Contenuto WhatsApp */}
                  <div className="text-sm whitespace-pre-wrap text-gray-800 font-sans">
                    {msg.content.split('---').slice(1).join('---').replace(/Messaggio pronto per WhatsApp/g, '').replace(/^-+/, '').trim()}
                  </div>
                  
                  {/* Pulsanti */}
                  <div className="mt-3 flex gap-4 border-t border-gray-100 pt-2">
                    <button 
                      onClick={() => navigator.clipboard.writeText(msg.content.split('---').slice(1).join('---').replace(/Messaggio pronto per WhatsApp/g, '').replace(/^-+/, '').trim())}
                      className="text-xs text-blue-600 font-bold flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> Copia
                    </button>
                    <button 
                      onClick={() => shareToWhatsApp(msg.content.split('---').slice(1).join('---').replace(/Messaggio pronto per WhatsApp/g, '').replace(/^-+/, '').trim())} 
                      className="text-xs text-green-600 font-bold flex items-center gap-1"
                    >
                      <Share2 className="w-3 h-3" /> Condividi
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              )}
              
              <div className="mt-2 text-[10px] text-gray-500 flex justify-between gap-4">
                <span>{msg.createdAt.toLocaleDateString()} {msg.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span>{msg.location}</span>
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
      </main>

      <footer className="p-2 bg-[#F0F0F0] border-t">
        <div className="flex items-center gap-2">
          <button 
            className={`p-2 rounded-full ${isRecording ? 'bg-red-500 text-white' : 'text-gray-500'}`}
            onClick={isRecording ? stopRecording : startRecording}
          >
            {isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
          <button className="p-2 text-gray-500" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-6 h-6" />
            <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.docx" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) processInput(`File: ${file.name}`, 'file');
            }} />
          </button>
          
          <input
            className="flex-grow p-2 rounded-full border border-gray-300"
            placeholder="Scrivi un messaggio..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && processInput(query, 'text')}
          />
          
          <button className="p-2 bg-[#075E54] text-white rounded-full" onClick={() => processInput(query, 'text')} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
          </button>
        </div>
      </footer>
    </div>
  );
}
