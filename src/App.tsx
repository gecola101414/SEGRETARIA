import React, { useState, useEffect, useRef } from 'react';
import { db, Message } from './db/database';
import { GoogleGenAI } from '@google/genai';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { pipeline } from '@xenova/transformers';
import { Mic, MicOff, Upload, Send, Loader2, Share2, FileText, Copy, Download, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const recognitionRef = useRef<any>(null);
  const initialQueryRef = useRef('');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestTranscriptRef = useRef('');

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

  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const playAudio = async (text: string): Promise<void> => {
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
          source.onended = () => resolve();
          source.start();
        } else {
          resolve();
        }
      } catch (err) {
        console.error("Errore riproduzione audio:", err);
        resolve();
      }
    });
  };

  const processInput = async (input: string, type: 'text' | 'audio' | 'file', metadata?: string, fileData?: { data: string, mimeType: string, name: string }, passToGemini: boolean = true) => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    stopListening();
    
    initAudio();
    await addMessage({ 
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
      let promptContents: any[] = [`Storico recente:\n${recentContext}\n\n`];
      if (relevantPast.length > 0) {
        const pastContext = relevantPast.map(m => `[Del ${m.createdAt.toLocaleDateString()}] ${m.sender === 'user' ? 'Utente' : 'Segretaria'}: ${m.content}`).join('\n');
        promptContents[0] += `Memoria storica pertinente a questa richiesta:\n${pastContext}\n\n`;
      }
      promptContents[0] += `Nuova richiesta: ${input}`;

      if (fileData && passToGemini) {
        promptContents.push({
          inlineData: {
            data: fileData.data,
            mimeType: fileData.mimeType
          }
        });
      }

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: promptContents,
        config: {
          systemInstruction: `Sei una Executive Assistant AI di altissimo livello, progettata per top manager e figure di spicco della finanza di Milano. La tua intelligenza è brillante, analitica, affilata e orientata al risultato.
Analizza l'input dell'utente (che può includere file PDF, Excel o Word) e rispondi in due parti separate ESATTAMENTE da "---":
1. Messaggio di cortesia (breve nota di lavoro interna, dritta al punto).
2. Messaggio pulito (il contenuto vero e proprio, formattato in modo IMPECCABILE per WhatsApp).

REGOLE DI COGNIZIONE E FOCUS (TASSATIVE):
- LASER FOCUS: Rispondi ESATTAMENTE e SOLO alla richiesta dell'utente. Niente divagazioni. TASSATIVO.
- ANALISI FILE: Se l'utente fornisce un file (PDF, Excel, Word), analizzalo con estrema cura e precisione. Estrai i dati richiesti senza inventare nulla.
- DIVAGAZIONI VIETATE: Se ritieni utile aggiungere un'informazione non richiesta, NON FARLO nel messaggio principale. Aggiungi invece una terza sezione separata da "===DIVAGAZIONE===" con il tuo commento extra.
- DATI PERSONALI: Basati ESCLUSIVAMENTE sulla "Memoria storica" e sullo "Storico recente". NON INVENTARE.
- RICERCA WEB MISURATA: Usa la ricerca web SOLO per mercati finanziari, notizie pubbliche o fatti oggettivi esplicitamente richiesti.
- STILE: Sii brillante, concisa, professionale. Stile "Milano Finanza". Zero fronzoli, massima resa.

REGOLE PER IL MESSAGGIO WHATSAPP (Parte 2):
- Usa elenchi puntati, spaziature chiare e tabulazioni per rendere la lettura facile e ordinata su smartphone.
- Non includere MAI i tuoi commenti iniziali in questa parte.
- Usa il grassetto (racchiudendo il testo tra asterischi, es. *Testo*) per evidenziare i concetti chiave.

IMPORTANTE: NON usare etichette come "AI:" o formattazione speciale per identificarti. Scrivi solo il testo del messaggio.`,
          temperature: 0.1, // Estremamente basso per massima precisione, logica ferrea e zero divagazioni
          tools: [{ googleSearch: {} }], // Abilita la ricerca Google in tempo reale
        }
      });

      let fullResponse = '';
      let politeMsg = '';
      let cleanMsg = '';
      let digressionMsg = '';
      let hasPlayedAudio = false;

      for await (const chunk of responseStream) {
        fullResponse += chunk.text;
        
        if (!hasPlayedAudio && fullResponse.includes('---')) {
          politeMsg = fullResponse.split('---')[0].trim();
          if (politeMsg) {
            hasPlayedAudio = true;
            playAudio(politeMsg).then(() => {
              startListening();
            });
          }
        }
      }

      if (!hasPlayedAudio && fullResponse.trim()) {
        politeMsg = fullResponse.trim();
        playAudio(politeMsg).then(() => {
          startListening();
        });
      }

      let mainResponse = fullResponse;
      if (fullResponse.includes('===DIVAGAZIONE===')) {
        const parts = fullResponse.split('===DIVAGAZIONE===');
        mainResponse = parts[0].trim();
        digressionMsg = parts[1].trim();
      }

      if (mainResponse.includes('---')) {
        const parts = mainResponse.split('---');
        politeMsg = parts[0].trim();
        cleanMsg = parts[1].trim();
      }

      await addMessage({ sender: 'ai', type: 'text', content: politeMsg + '---' + cleanMsg });
      
      if (digressionMsg) {
        await addMessage({ sender: 'ai', type: 'text', content: '💡 *Nota aggiuntiva della Segretaria:*\n\n' + digressionMsg });
      }
    } catch (error) {
      console.error("Errore elaborazione:", error);
      await addMessage({ sender: 'ai', type: 'text', content: '⚠️ Si è verificato un errore. Riprova.' });
    } finally {
      setIsLoading(false);
    }
  };

  const startListening = () => {
    initAudio();
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Il riconoscimento vocale non è supportato in questo browser. Prova con Chrome o Safari.');
      return;
    }

    stopListening();

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'it-IT';

    initialQueryRef.current = query;
    latestTranscriptRef.current = query;

    recognition.onstart = () => {
      if (recognitionRef.current === recognition) {
        setIsRecording(true);
      }
    };

    recognition.onresult = (event: any) => {
      if (recognitionRef.current !== recognition) return;

      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript.trim())
        .filter(Boolean)
        .join(' ');
      
      const currentText = initialQueryRef.current 
        ? initialQueryRef.current + ' ' + transcript
        : transcript;
        
      setQuery(currentText);
      latestTranscriptRef.current = currentText;

      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      
      silenceTimerRef.current = setTimeout(() => {
        if (recognitionRef.current === recognition) {
          stopListening();
          if (latestTranscriptRef.current.trim()) {
            const textToSend = latestTranscriptRef.current;
            latestTranscriptRef.current = '';
            processInput(textToSend, 'text');
          }
        }
      }, 2000);
    };

    recognition.onerror = (event: any) => {
      if (recognitionRef.current !== recognition) return;
      console.error("Errore riconoscimento vocale:", event.error);
      stopListening();
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        stopListening();
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
          
          if (latestTranscriptRef.current.trim()) {
            const textToSend = latestTranscriptRef.current;
            latestTranscriptRef.current = '';
            processInput(textToSend, 'text');
          }
        }
      }
    };

    recognition.start();
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
    stopListening();
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const handleSend = () => {
    handleManualStop();
    if (query.trim()) {
      processInput(query, 'text');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsLoading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        
        if (file.name.endsWith('.pdf')) {
          await processInput(`Analizza questo documento PDF: ${file.name}`, 'file', file.name, {
            data: base64,
            mimeType: 'application/pdf',
            name: file.name
          }, true);
        } else if (file.name.endsWith('.docx')) {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          const fileText = result.value;
          await processInput(`Analizza questo documento Word (${file.name}):\n\n${fileText}`, 'file', file.name, {
            data: base64,
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            name: file.name
          }, false);
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const arrayBuffer = await file.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const fileText = XLSX.utils.sheet_to_csv(firstSheet);
          await processInput(`Analizza questo foglio Excel (${file.name}):\n\n${fileText}`, 'file', file.name, {
            data: base64,
            mimeType: file.name.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/vnd.ms-excel',
            name: file.name
          }, false);
        } else if (file.name.endsWith('.txt')) {
          const fileText = await file.text();
          await processInput(`Analizza questo file di testo (${file.name}):\n\n${fileText}`, 'file', file.name, {
            data: base64,
            mimeType: 'text/plain',
            name: file.name
          }, false);
        } else {
          alert('Formato file non supportato. Usa PDF, DOCX, XLSX o TXT.');
        }
        setIsLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error(error);
      setIsLoading(false);
    }
  };

  const generatePDF = (content: string) => {
    const doc = new jsPDF();
    const splitText = doc.splitTextToSize(content, 180);
    let y = 15;
    for (let i = 0; i < splitText.length; i++) {
      if (y > 280) {
        doc.addPage();
        y = 15;
      }
      doc.text(splitText[i], 15, y);
      y += 7;
    }
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
                  <div className="text-xs text-gray-500 italic border-b border-gray-200 pb-2 mb-2 relative pr-6">
                    <span className="font-semibold not-italic text-gray-600">Note interne: </span>
                    <span className="whitespace-pre-wrap">{msg.content.split('---')[0].trim()}</span>
                    <button 
                      onClick={() => playAudio(msg.content.split('---')[0].trim())}
                      className="absolute top-0 right-0 p-1 text-gray-400 hover:text-gray-600"
                      title="Riproduci nota"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {/* Contenuto WhatsApp */}
                  <div className="text-sm whitespace-pre-wrap text-gray-800 font-sans">
                    {msg.content.split('---').slice(1).join('---').replace(/Messaggio pronto per WhatsApp/g, '').replace(/^-+/, '').trim()}
                  </div>
                  
                  {/* Pulsanti */}
                  <div className="mt-3 flex gap-4 border-t border-gray-100 pt-2 flex-wrap">
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
                    <button 
                      onClick={() => generatePDF(msg.content.split('---').slice(1).join('---').replace(/Messaggio pronto per WhatsApp/g, '').replace(/^-+/, '').trim())} 
                      className="text-xs text-red-600 font-bold flex items-center gap-1"
                    >
                      <FileText className="w-3 h-3" /> Scarica PDF
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
            className={`p-2 rounded-full ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'text-gray-500'}`}
            onClick={isRecording ? handleManualStop : startListening}
          >
            {isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
          <button className="p-2 text-gray-500" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-6 h-6" />
            <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.docx,.pdf,.xlsx,.xls" onChange={handleFileUpload} />
          </button>
          
          <input
            className="flex-grow p-2 rounded-full border border-gray-300"
            placeholder="Scrivi un messaggio..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          />
          
          <button className="p-2 bg-[#075E54] text-white rounded-full" onClick={handleSend} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
          </button>
        </div>
      </footer>
    </div>
  );
}
