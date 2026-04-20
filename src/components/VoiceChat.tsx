import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ai, LIVE_MODEL } from '../lib/gemini';
import { Book } from '../types';
import { Modality } from '@google/genai';

interface VoiceChatProps {
  book: Book;
  currentText: string;
}

export const VoiceChat: React.FC<VoiceChatProps> = ({ book, currentText }) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [status, setStatus] = useState('Ready to chat');
  const [transcript, setTranscript] = useState('');
  
  const liveRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const toggleVoice = async () => {
    if (isActive) {
      stopVoice();
      return;
    }
    startVoice();
  };

  const startVoice = async () => {
    setIsConnecting(true);
    setStatus('Connecting to Live API...');
    
    try {
      // 1. Initialize AudioContext robustly
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!audioContextRef.current) {
        try {
          audioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
        } catch (e) {
          console.warn("AudioContext custom sample rate failed, fallback to default", e);
          audioContextRef.current = new AudioContextClass();
        }
      }

      // Ensure AudioContext is resumed (browser requirement)
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // 2. Request Microphone Access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // 3. Connect to Live API
      const live = ai.live.connect({
        model: LIVE_MODEL,
        config: {
          systemInstruction: `You are a helpful companion for the book "${book.title}".
          The user is currently reading this text: ${currentText.substring(0, 500)}...
          Engage in a natural voice conversation about the book.`,
          responseModalities: [Modality.AUDIO],
        },
        callbacks: {
          onopen: () => {
            setIsActive(true);
            setIsConnecting(false);
            setStatus('Listening...');
            
            // Start capturing and sending audio if open
            setupAudioInput(stream);
          },
          onclose: () => {
            stopVoice();
          },
          onmessage: (message) => {
             // Handle transcripts if they are available in the message
             if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
               setTranscript(prev => prev + ' ' + message.serverContent?.modelTurn?.parts?.[0]?.text);
             }
             // Handle audio output
             const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
             if (audioData) {
               playOutputAudio(audioData);
             }
          },
          onerror: (err) => {
            console.error(err);
            stopVoice();
            setStatus('Connection error. Try again.');
          }
        }
      });

      liveRef.current = live;

    } catch (err) {
      console.error(err);
      setIsConnecting(false);
      if (err instanceof Error && err.name === 'NotSupportedError') {
         setStatus('Browser audio config not supported.');
      } else {
         setStatus('Microphone access denied or hardware error.');
      }
    }
  };

  const setupAudioInput = async (stream: MediaStream) => {
    if (!audioContextRef.current || !liveRef.current) return;
    
    // Create a simple script processor for audio capture (compatible and easy for now)
    const source = audioContextRef.current.createMediaStreamSource(stream);
    const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      // Convert Float32 to Int16 PCM
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
      }
      
      // Base64 encode and send
      const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
      liveRef.current.sendRealtimeInput({
        audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
      });
    };
    
    source.connect(processor);
    processor.connect(audioContextRef.current.destination);
    
    // Store for cleanup
    (liveRef.current as any)._audioCleanup = () => {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach(t => t.stop());
    };
  };

  const playOutputAudio = (base64Audio: string) => {
    if (!audioContextRef.current) return;
    
    const binary = atob(base64Audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    
    // Raw PCM 16-bit 24kHz (usually from Live API)
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
    
    const buffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.start();
  };

  const stopVoice = () => {
    if (liveRef.current) {
      if ((liveRef.current as any)._audioCleanup) {
        (liveRef.current as any)._audioCleanup();
      }
      liveRef.current.close();
      liveRef.current = null;
    }
    setIsActive(false);
    setIsConnecting(false);
    setStatus('Disconnected');
    setTranscript('');
  };

  useEffect(() => {
    return () => {
      stopVoice();
    };
  }, []);

  return (
    <div id="voice-chat-container" className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center p-6 bg-violet-50/30 rounded-3xl border border-violet-100">
      <div className="mb-8 relative">
        <AnimatePresence>
          {isActive && (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1.2, opacity: 0.2 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ repeat: Infinity, duration: 1.5, repeatType: 'reverse' }}
              className="absolute inset-0 bg-violet-500 rounded-full"
            />
          )}
        </AnimatePresence>
        
        <button 
          onClick={toggleVoice}
          disabled={isConnecting}
          className={`relative z-10 h-24 w-24 flex items-center justify-center rounded-full shadow-2xl transition-all active:scale-95 ${
            isActive ? 'bg-red-500 text-white' : 'bg-violet-600 text-white shadow-violet-200 shadow-2xl'
          } ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isConnecting ? (
            <Loader2 size={40} className="animate-spin" />
          ) : isActive ? (
            <MicOff size={40} />
          ) : (
            <Mic size={40} />
          )}
        </button>
      </div>

      <div className="space-y-2">
        <h3 className="text-xl font-bold font-sans">
          {isActive ? 'Live Conversation' : 'Voice Assistant'}
        </h3>
        <p className={`text-sm font-bold uppercase tracking-widest ${isActive ? 'text-violet-600' : 'text-gray-400'}`}>
          {status}
        </p>
      </div>

      <div className="mt-8 min-h-[60px] max-w-xs text-sm text-gray-500 italic font-serif leading-relaxed">
        {transcript || (isActive ? "Waiting for you to speak..." : "Discuss the book naturally using your voice. Ask about themes, characters, or translations.")}
      </div>

      {isActive && (
         <div className="mt-8 flex gap-2">
            {[1, 2, 3, 4, 5].map(i => (
              <motion.div 
                key={i}
                animate={{ height: [8, Math.random() * 24 + 8, 8] }}
                transition={{ repeat: Infinity, duration: 0.5 + Math.random() }}
                className="w-1.5 bg-violet-400 rounded-full"
              />
            ))}
         </div>
      )}
    </div>
  );
};
