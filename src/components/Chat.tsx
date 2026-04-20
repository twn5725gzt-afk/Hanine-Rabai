import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ai, CHAT_MODEL } from '../lib/gemini';
import { Book } from '../types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatProps {
  book: Book;
  currentText: string;
}

export const Chat: React.FC<ChatProps> = ({ book, currentText }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const chat = ai.chats.create({
        model: CHAT_MODEL,
        config: {
          systemInstruction: `You are an expert literary assistant for the book titled "${book.title}" by ${book.author}. 
          Current context from the book: ${currentText.substring(0, 1000)}...
          Answer questions about plot, characters, historical context, and linguistics. Be helpful and insightful.`,
        }
      });

      const result = await chat.sendMessage({ message: userMsg });
      const responseText = result.text || "I'm sorry, I couldn't generate a response.";
      
      setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: "An error occurred while talking to Gemini. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="chat-container" className="flex flex-col h-[calc(100vh-120px)]">
      <div 
        ref={scrollRef}
        id="messages-list" 
        className="flex-1 overflow-y-auto space-y-4 p-2 custom-scrollbar"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center opacity-50">
            <Sparkles size={32} className="mb-2 text-violet-500" />
            <p className="text-sm">Start a conversation about the current chapter!</p>
          </div>
        )}
        
        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
              m.role === 'user' 
                ? 'bg-violet-600 text-white shadow-xl shadow-violet-100' 
                : 'bg-white border border-gray-100 text-gray-800'
            }`}>
              <div className="flex items-center gap-1 mb-1 opacity-70 text-[10px] font-bold uppercase tracking-widest">
                {m.role === 'user' ? <User size={10} /> : <Bot size={10} />}
                {m.role === 'user' ? 'You' : 'Gemini'}
              </div>
              <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
            </div>
          </motion.div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-violet-50 rounded-2xl px-4 py-2 flex items-center gap-2 border border-violet-100">
              <Loader2 size={16} className="animate-spin text-violet-600" />
              <span className="text-xs text-violet-500 font-bold uppercase tracking-widest">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      <div id="chat-input-area" className="mt-4 border-t border-gray-50 pt-4">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about this chapter..."
            className="w-full rounded-2xl border border-gray-100 bg-violet-50/50 px-4 py-3 pr-12 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 transition-all resize-none min-h-[44px] max-h-32"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={`absolute right-2 bottom-2 rounded-xl p-2 transition-all ${
              input.trim() && !isLoading 
                ? 'bg-violet-600 text-white shadow-lg' 
                : 'bg-gray-100 text-gray-300'
            }`}
          >
            <Send size={18} />
          </button>
        </div>
        <p className="mt-2 text-[10px] text-gray-400 text-center">
          AI generated content may be inaccurate.
        </p>
      </div>
    </div>
  );
};
