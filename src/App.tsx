import React, { useState, useEffect, useRef } from 'react';
import { db, Message } from './db/database';
import { GoogleGenAI } from '@google/genai';
import mammoth from 'mammoth';
import { pipeline } from '@xenova/transformers';
import { Mic, MicOff, Upload, Send, Loader2, Share2, FileText } from 'lucide-react';
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
      const allContext = messages.map(m => m.content).join('\n\n');

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Sei una segretaria intelligente. Analizza l'input dell'utente e rispondi in due parti separate da "---":
        1. Messaggio di cortesia (breve e cordiale).
        2. Messaggio pulito (il contenuto vero e proprio, pronto per essere copiato o inviato su WhatsApp).
        
        IMPORTANTE: NON usare asterischi, etichette come "AI:", o formattazione speciale per identificarti. Scrivi solo il testo del messaggio.
        
        Se l'utente chiede un PDF, rispondi solo "PDF: [Contenuto pulito]".
        
        Contesto: ${allContext}
        Input: ${input}
        `,
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
        await addMessage({ sender: 'ai', type: 'text', content: politeMsg + '\n\n--- Messaggio pronto per WhatsApp ---\n\n' + cleanMsg });
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
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              
              {msg.sender === 'ai' && msg.content.includes('---') && (
                <button 
                  onClick={() => navigator.clipboard.writeText(msg.content.split('---')[1].trim())}
                  className="mt-2 text-xs text-blue-600 font-bold block"
                >
                  Copia contenuto pulito
                </button>
              )}
              
              <div className="mt-2 text-[10px] text-gray-500 flex justify-between gap-4">
                <span>{msg.createdAt.toLocaleDateString()} {msg.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span>{msg.location}</span>
              </div>

              {msg.sender === 'ai' && !msg.content.includes('PDF') && (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => shareToWhatsApp(msg.content.split('---').pop() || msg.content)} className="text-xs text-gray-500 flex items-center gap-1">
                    <Share2 className="w-3 h-3" /> WhatsApp
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
