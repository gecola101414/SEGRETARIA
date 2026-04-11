import React, { useState } from 'react';
import { Send, Loader2, Camera } from 'lucide-react';

interface ChatInputProps {
  onSend: (text: string) => void;
  isLoading: boolean;
  startCamera: () => void;
}

export default function ChatInput({ onSend, isLoading, startCamera }: ChatInputProps) {
  const [localQuery, setLocalQuery] = useState('');

  const handleSend = () => {
    if (localQuery.trim()) {
      onSend(localQuery);
      setLocalQuery('');
    }
  };

  return (
    <div className="flex items-end gap-2 p-2 w-full">
      <button className="p-2 text-gray-500 cursor-pointer shrink-0" onClick={startCamera}>
        <Camera className="w-6 h-6" />
      </button>
      
      <textarea
        className="flex-grow p-2 rounded-2xl border border-gray-300 max-h-32 overflow-y-auto resize-none"
        placeholder="Scrivi un messaggio..."
        value={localQuery}
        onChange={(e) => setLocalQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        rows={1}
        style={{ minHeight: '40px' }}
      />
      
      <button className="p-2 bg-[#075E54] text-white rounded-full cursor-pointer shrink-0" onClick={handleSend} disabled={isLoading}>
        {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
      </button>
    </div>
  );
}
