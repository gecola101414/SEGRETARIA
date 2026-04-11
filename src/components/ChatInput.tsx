import React from 'react';
import { Send, Loader2, Camera } from 'lucide-react';

interface ChatInputProps {
  query: string;
  setQuery: (query: string) => void;
  handleSend: () => void;
  isLoading: boolean;
  startCamera: () => void;
}

export default function ChatInput({ query, setQuery, handleSend, isLoading, startCamera }: ChatInputProps) {
  return (
    <footer className="p-4 bg-white border-t flex items-center gap-2">
      <button className="p-2 text-gray-500 cursor-pointer" onClick={startCamera}>
        <Camera className="w-6 h-6" />
      </button>
      
      <input
        className="flex-grow p-2 rounded-full border border-gray-300"
        placeholder="Scrivi un messaggio..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
      />
      
      <button className="p-2 bg-[#075E54] text-white rounded-full cursor-pointer" onClick={handleSend} disabled={isLoading}>
        {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
      </button>
    </footer>
  );
}
