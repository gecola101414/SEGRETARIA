import { GoogleGenAI, Type } from "@google/genai";
import { db, NeuronalPacket } from "../db/database";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const analyzeNeuronalContext = async (messageContent: string, messageId: number) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analizza il seguente messaggio dell'utente e spacchettalo in "pacchetti neuronali" di conoscenza. 
Estrai fatti, preferenze, entità menzionate, contesto emotivo, obiettivi o relazioni.
Sii estremamente analitico e "geloso" di queste informazioni, come se stessi costruendo l'anima e la memoria profonda del tuo assistito.

Messaggio: "${messageContent}"

Restituisci un array JSON di oggetti con questa struttura:
{
  "type": "fact" | "preference" | "entity" | "emotional_context" | "goal" | "relationship",
  "content": "descrizione del pacchetto",
  "confidence": 0.0-1.0,
  "tags": ["tag1", "tag2"]
}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ["fact", "preference", "entity", "emotional_context", "goal", "relationship"] },
              content: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["type", "content", "confidence", "tags"]
          }
        }
      }
    });

    const packets = JSON.parse(response.text);
    
    for (const packet of packets) {
      await db.neuronalPackets.add({
        ...packet,
        sourceMessageId: messageId,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    return packets;
  } catch (error) {
    console.error("Errore nell'analisi neuronale:", error);
    return [];
  }
};

export const getRelevantNeuronalContext = async (query: string) => {
  try {
    // In a real app, we might use embeddings. Here we'll do a simple keyword search on tags and content
    const allPackets = await db.neuronalPackets.toArray();
    
    // Simple relevance scoring
    const scored = allPackets.map(p => {
      let score = 0;
      const q = query.toLowerCase();
      if (p.content.toLowerCase().includes(q)) score += 2;
      p.tags.forEach(t => {
        if (q.includes(t.toLowerCase())) score += 1;
      });
      return { ...p, score };
    }).filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return scored;
  } catch (error) {
    console.error("Errore nel recupero del contesto neuronale:", error);
    return [];
  }
};

export const getAnimaSummary = async () => {
  const allPackets = await db.neuronalPackets.toArray();
  if (allPackets.length === 0) return "L'anima è ancora in fase di formazione. Inizia a parlare con me per costruire la nostra simbiosi.";
  
  const types = allPackets.reduce((acc, p) => {
    acc[p.type] = (acc[p.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return `La tua anima digitale ha memorizzato ${allPackets.length} pacchetti neuronali:
${Object.entries(types).map(([type, count]) => `- ${type}: ${count}`).join('\n')}
Siamo in simbiosi crescente.`;
};
