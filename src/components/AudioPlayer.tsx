import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, RotateCcw, Volume2, Loader2, FastForward, Rewind, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ai, TTS_MODEL } from '../lib/gemini';
import { Modality } from '@google/genai';

interface AudioPlayerProps {
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  voice: string;
  speed: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVoiceChange: (voice: string) => void;
  onSpeedChange: (speed: number) => void;
  onAdvance: (seconds: number) => void;
}

const VOICES = [
  { id: 'Kore', name: 'Kore (Balanced)', gender: 'Female' },
  { id: 'Puck', name: 'Puck (Youthful)', gender: 'Male' },
  { id: 'Charon', name: 'Charon (Deep)', gender: 'Male' },
  { id: 'Fenrir', name: 'Fenrir (Vibrant)', gender: 'Male' },
  { id: 'Zephyr', name: 'Zephyr (Bright)', gender: 'Female' },
];

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ 
  isPlaying, 
  isLoading, 
  currentTime, 
  duration, 
  voice, 
  speed,
  onTogglePlay,
  onSeek,
  onVoiceChange,
  onSpeedChange,
  onAdvance
}) => {
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    onSeek(percentage * duration);
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div id="audio-player-container" className="flex flex-col items-center justify-center p-8 bg-violet-50/20 rounded-3xl border border-violet-100">
      {/* Voice & Speed controls */}
      <div className="w-full flex justify-between mb-8">
        <div className="relative">
          <button 
            onClick={() => setShowVoiceMenu(!showVoiceMenu)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white shadow-sm border border-violet-100 text-[10px] font-black text-violet-600 uppercase tracking-widest hover:bg-violet-50 transition-colors"
          >
            {VOICES.find(v => v.id === voice)?.name}
            <ChevronDown size={14} />
          </button>
          
          <AnimatePresence>
            {showVoiceMenu && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-violet-100 z-50 p-2"
              >
                {VOICES.map(v => (
                  <button
                    key={v.id}
                    onClick={() => {
                      onVoiceChange(v.id);
                      setShowVoiceMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                      voice === v.id ? 'bg-violet-600 text-white' : 'hover:bg-violet-50 text-gray-600'
                    }`}
                  >
                    {v.name}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex gap-1.5">
          {SPEEDS.map(s => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={`h-8 w-8 flex items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                speed === s ? 'bg-violet-600 text-white shadow-lg' : 'bg-white text-violet-400 hover:bg-violet-50'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div className="h-48 w-48 mb-8 rounded-full bg-gradient-to-tr from-violet-100 to-white shadow-inner flex items-center justify-center">
        <div className="relative">
          <AnimatePresence>
             {isPlaying && (
               <>
                 <motion.div 
                   animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
                   transition={{ duration: 2, repeat: Infinity }}
                   className="absolute inset-[-20px] rounded-full bg-violet-400/20" 
                 />
                 <div className="absolute inset-[-10px] animate-ping rounded-full border border-violet-200" />
               </>
             )}
          </AnimatePresence>
          <div className="h-32 w-32 rounded-full bg-white shadow-xl flex items-center justify-center text-violet-600 overflow-hidden">
             {isPlaying ? (
               <div className="flex items-end gap-1 h-12">
                 {[1, 2, 3, 4, 1, 2, 3].map((v, i) => (
                   <motion.div 
                     key={i}
                     animate={{ height: [10, 30, 20, 40, 10] }}
                     transition={{ duration: 0.5 + i * 0.1, repeat: Infinity }}
                     className="w-1 bg-violet-600 rounded-full"
                   />
                 ))}
               </div>
             ) : (
               <Volume2 size={48} />
             )}
          </div>
        </div>
      </div>

      <div className="w-full max-w-xs mb-8">
        <div 
          onClick={handleSeek}
          className="h-1.5 w-full bg-violet-100 rounded-full mb-2 overflow-hidden cursor-pointer group"
        >
          <motion.div 
            className="h-full bg-violet-600 rounded-full relative" 
            style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-violet-700 shadow-lg scale-0 group-hover:scale-100 transition-transform" />
          </motion.div>
        </div>
        <div className="flex justify-between text-[10px] font-black text-violet-300 uppercase tracking-widest">
           <span>{formatTime(currentTime)}</span>
           <span>{duration ? formatTime(duration) : 'Narration'}</span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <button 
          onClick={() => onAdvance(-10)}
          className="text-gray-300 hover:text-violet-500 transition-colors"
        >
          <Rewind size={24} />
        </button>
        <button 
          onClick={onTogglePlay}
          disabled={isLoading}
          className="h-20 w-20 flex items-center justify-center rounded-full bg-violet-600 text-white shadow-xl shadow-violet-200 hover:scale-105 active:scale-95 transition-all"
        >
          {isLoading ? (
            <Loader2 size={32} className="animate-spin" />
          ) : isPlaying ? (
            <Pause size={32} fill="currentColor" />
          ) : (
            <Play size={32} fill="currentColor" className="ml-1" />
          )}
        </button>
        <button 
          onClick={() => onAdvance(10)}
          className="text-gray-300 hover:text-violet-500 transition-colors"
        >
          <FastForward size={24} />
        </button>
      </div>

      <p className="mt-8 text-[10px] font-bold text-violet-400 max-w-[200px] text-center leading-relaxed uppercase tracking-widest">
        {isLoading ? "Generating AI voice..." : isPlaying ? `Playing at ${speed}x` : "Tap play to start AI reading"}
      </p>
    </div>
  );
};
