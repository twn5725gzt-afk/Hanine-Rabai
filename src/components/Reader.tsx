import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Type, 
  Moon, 
  Sun, 
  Columns, 
  BookOpen,
  Volume2,
  MessageSquare,
  Play,
  RotateCcw,
  Languages,
  Menu,
  List,
  Highlighter,
  Trash2,
  Check,
  Search,
  Filter,
  Notebook,
  Pause,
  Rewind,
  FastForward,
  Download,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Book, Settings, Highlight } from '../types';
import { EpubProcessor } from '../services/epubService';
import { translateChunked } from '../services/translationService';
import { Chat } from './Chat';
import { VoiceChat } from './VoiceChat';
import { AudioPlayer } from './AudioPlayer';
import { ai, TTS_MODEL } from '../lib/gemini';
import { Modality } from '@google/genai';
import { User } from 'firebase/auth';
import { db, handleFirestoreError } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, onSnapshot, deleteDoc } from 'firebase/firestore';

interface ReaderProps {
  book: Book;
  onBack: () => void;
  settings: Settings;
  updateSettings: (s: Partial<Settings>) => void;
  user: User | null;
}

export const Reader: React.FC<ReaderProps> = ({ book, onBack, settings, updateSettings, user }) => {
  const [currentChapter, setCurrentChapter] = useState('');
  const [originalText, setOriginalText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [toc, setToc] = useState<any[]>([]);
  const [activeSidePanel, setActiveSidePanel] = useState<'none' | 'chat' | 'audio' | 'voice' | 'notebook'>('none');
  const [scrollProgress, setScrollProgress] = useState(0);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [selection, setSelection] = useState<{ text: string; rect: DOMRect } | null>(null);
  const [highlightFilter, setHighlightFilter] = useState<Highlight['color'] | 'all'>('all');
  const [notebookSearch, setNotebookSearch] = useState('');
  const [narrationAudio, setNarrationAudio] = useState<HTMLAudioElement | null>(null);
  const [isNarratingSelection, setIsNarratingSelection] = useState(false);
  
  // Download State
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Global Narration State
  const [isNarrationPlaying, setIsNarrationPlaying] = useState(false);
  const [isNarrationLoading, setIsNarrationLoading] = useState(false);
  const [narrationUrl, setNarrationUrl] = useState<string | null>(null);
  const [narrationTime, setNarrationTime] = useState(0);
  const [narrationDuration, setNarrationDuration] = useState(0);
  const [narrationVoice, setNarrationVoice] = useState('Kore');
  const [narrationSpeed, setNarrationSpeed] = useState(1);
  const globalAudioRef = useRef<HTMLAudioElement | null>(null);

  const pcmToWav = (pcmData: Uint8Array, sampleRate: number = 24000): Blob => {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + pcmData.length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample
    writeString(36, 'data');
    view.setUint32(40, pcmData.length, true);

    return new Blob([header, pcmData], { type: 'audio/wav' });
  };

  const generateNarration = async (targetText: string) => {
    if (!targetText || isNarrationLoading) return;
    
    setIsNarrationLoading(true);
    try {
      const response = await ai.models.generateContent({
        model: TTS_MODEL,
        contents: [{ parts: [{ text: `Read this passage with high emotional intelligence and literary depth: ${targetText.substring(0, 2000)}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: narrationVoice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const binary = atob(base64Audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = pcmToWav(bytes, 24000);
        const url = URL.createObjectURL(blob);
        
        if (narrationUrl) URL.revokeObjectURL(narrationUrl);
        setNarrationUrl(url);
        setIsNarrationPlaying(true);
      }
    } catch (error) {
      console.error("Narration error:", error);
    } finally {
      setIsNarrationLoading(false);
    }
  };

  useEffect(() => {
    if (globalAudioRef.current) {
      globalAudioRef.current.playbackRate = narrationSpeed;
    }
  }, [narrationSpeed]);

  const toggleNarration = () => {
    if (!narrationUrl) {
      generateNarration(translatedText || originalText);
      return;
    }
    if (globalAudioRef.current) {
      if (isNarrationPlaying) globalAudioRef.current.pause();
      else globalAudioRef.current.play();
      setIsNarrationPlaying(!isNarrationPlaying);
    }
  };

  const handleNarrationTimeUpdate = () => {
    if (globalAudioRef.current) {
      setNarrationTime(globalAudioRef.current.currentTime);
      setNarrationDuration(globalAudioRef.current.duration);
    }
  };

  const seekNarration = (time: number) => {
    if (globalAudioRef.current) globalAudioRef.current.currentTime = time;
  };
  
  const epubRef = useRef<EpubProcessor | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const progress = (target.scrollTop / (target.scrollHeight - target.clientHeight)) * 100;
    setScrollProgress(progress);
  };

  useEffect(() => {
    const initEpub = async () => {
      const processor = new EpubProcessor();
      await processor.loadBook(book.fileData);
      epubRef.current = processor;
      
      const loadedToc = await processor.getTOC();
      setToc(loadedToc);
      
      if (loadedToc && loadedToc.length > 0) {
        loadChapter(loadedToc[0].href);
      }
    };
    
    initEpub();
  }, [book]);

  useEffect(() => {
    if (!user || !book.id) return;

    const highlightsRef = collection(db, 'users', user.uid, 'books', book.id, 'highlights');
    const q = query(highlightsRef);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const hls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Highlight));
      setHighlights(hls);
    });

    return unsubscribe;
  }, [user, book.id]);

  const handleTextSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setSelection(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Ensure selection is within the reader content
    const readerContent = document.getElementById('reader-content');
    if (readerContent && readerContent.contains(range.startContainer)) {
      setSelection({
        text: sel.toString().trim(),
        rect
      });
    }
  };

  const narrateSelection = async () => {
    if (!selection) return;
    setIsNarratingSelection(true);
    try {
      const response = await ai.models.generateContent({
        model: TTS_MODEL,
        contents: [{ parts: [{ text: `Read this passage clearly: ${selection.text.substring(0, 1000)}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: narrationVoice },
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
        const blob = pcmToWav(bytes, 24000);
        const url = URL.createObjectURL(blob);
        
        if (narrationAudio) {
          narrationAudio.pause();
          URL.revokeObjectURL(narrationAudio.src);
        }
        
        const audio = new Audio(url);
        setNarrationAudio(audio);
        audio.play();
        audio.onended = () => {
          setIsNarratingSelection(false);
          setSelection(null);
        };
      }
    } catch (err) {
      console.error("Narration failed", err);
    } finally {
      setIsNarratingSelection(false);
    }
  };

  const addHighlight = async (color: Highlight['color']) => {
    if (!selection || !user) return;

    const highlightId = crypto.randomUUID();
    const newHighlight: Highlight = {
      id: highlightId,
      bookId: book.id,
      chapterId: currentChapter,
      text: selection.text,
      color,
      createdAt: Date.now()
    };

    try {
      const hlRef = doc(db, 'users', user.uid, 'books', book.id, 'highlights', highlightId);
      await setDoc(hlRef, newHighlight);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    } catch (err) {
      console.error("Failed to save highlight", err);
      handleFirestoreError(err, 'create', `users/${user.uid}/books/${book.id}/highlights`);
    }
  };

  const deleteHighlight = async (id: string) => {
    if (!user) return;
    try {
      const hlRef = doc(db, 'users', user.uid, 'books', book.id, 'highlights', id);
      await deleteDoc(hlRef);
    } catch (err) {
      console.error("Failed to delete highlight", err);
    }
  };

  const translateChapterText = async (text: string, href: string) => {
    if (!text || isTranslating) return;
    setIsTranslating(true);
    try {
      const translation = await translateChunked(text);
      setTranslatedText(translation);

      // Save to cloud cache
      if (user) {
        const transId = btoa(href).replace(/[+/=]/g, '_');
        const transRef = doc(db, 'users', user.uid, 'books', book.id, 'translations', transId);
        await setDoc(transRef, {
          bookId: book.id,
          chapterId: href,
          originalText: text.substring(0, 500), // metadata
          translatedText: translation,
          language: 'English',
          updatedAt: Date.now()
        });
      }
    } catch (err) {
      console.error(err);
      if (user) handleFirestoreError(err, 'create', `users/${user.uid}/books/${book.id}/translations`);
    } finally {
      setIsTranslating(false);
    }
  };

  const loadChapter = async (href: string) => {
    if (!epubRef.current) return;
    setCurrentChapter(href);
    const text = await epubRef.current.getChapterText(href);
    setOriginalText(text);
    setTranslatedText(''); 
    setScrollProgress(0);
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    
    let hasCache = false;
    if (user) {
      try {
        const transId = btoa(href).replace(/[+/=]/g, '_'); // Safe ID
        const transRef = doc(db, 'users', user.uid, 'books', book.id, 'translations', transId);
        const transDoc = await getDoc(transRef);
        if (transDoc.exists()) {
          setTranslatedText(transDoc.data().translatedText);
          hasCache = true;
        }
      } catch (err) {
        console.error("Failed to fetch translation cache", err);
      }
    }

    // Automatically translate if no cache is found
    if (!hasCache) {
      translateChapterText(text, href);
    }
  };

  const handleTranslate = async () => {
    await translateChapterText(originalText, currentChapter);
  };

  const downloadTranslatedBook = async () => {
    if (isDownloading || !epubRef.current || toc.length === 0) return;
    setIsDownloading(true);
    setDownloadProgress(0);
    
    try {
      let fullBookHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${book.title} - Translated</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
            body { 
              font-family: 'Inter', serif; 
              line-height: 1.8; 
              max-width: 900px; 
              margin: 0 auto; 
              padding: 4rem 2rem; 
              background: #f8f9fa;
              color: #1a1a1a;
            }
            .container {
              background: white;
              padding: 4rem;
              border-radius: 2rem;
              box-shadow: 0 10px 30px rgba(0,0,0,0.05);
            }
            h1 { 
              text-align: center; 
              color: #4c1d95; 
              font-size: 3rem; 
              margin-bottom: 1rem;
            }
            .meta {
              text-align: center;
              color: #6d28d9;
              font-weight: bold;
              margin-bottom: 4rem;
              text-transform: uppercase;
              letter-spacing: 2px;
              font-size: 0.8rem;
            }
            h2 { 
              border-bottom: 1px solid #e5e7eb; 
              padding-bottom: 1rem; 
              margin-top: 5rem; 
              color: #4c1d95;
            }
            .chapter-content { margin-bottom: 2rem; }
            p { margin-bottom: 1.5rem; text-align: justify; }
            .chapter-label {
              font-size: 0.75rem;
              text-transform: uppercase;
              letter-spacing: 3px;
              color: #8b5cf6;
              font-weight: 900;
              margin-bottom: 1rem;
              display: block;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>${book.title}</h1>
            <div class="meta">Translated by Texta AI</div>
      `;

      for (let i = 0; i < toc.length; i++) {
        const chapter = toc[i];
        setDownloadProgress(Math.round((i / toc.length) * 100));
        
        const text = await epubRef.current.getChapterText(chapter.href);
        let translation = "";
        
        if (user) {
          const transId = btoa(chapter.href).replace(/[+/=]/g, '_');
          const transRef = doc(db, 'users', user.uid, 'books', book.id, 'translations', transId);
          const transDoc = await getDoc(transRef);
          if (transDoc.exists()) {
            translation = transDoc.data().translatedText;
          }
        }
        
        if (!translation) {
          translation = await translateChunked(text);
          if (user) {
            const transId = btoa(chapter.href).replace(/[+/=]/g, '_');
            const transRef = doc(db, 'users', user.uid, 'books', book.id, 'translations', transId);
            await setDoc(transRef, {
              bookId: book.id,
              chapterId: chapter.href,
              translatedText: translation,
              updatedAt: Date.now()
            });
          }
        }
        
        fullBookHtml += `
          <div class="chapter-content">
            <span class="chapter-label">Chapter ${i + 1}</span>
            <h2>${chapter.label}</h2>
            ${translation.split('\n').filter(p => p.trim()).map(p => `<p>${p}</p>`).join('')}
          </div>
        `;
      }

      fullBookHtml += `</div></body></html>`;
      
      const blob = new Blob([fullBookHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${book.title}_translated.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDownloadProgress(100);
      setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress(0);
      }, 2000);
    } catch (err) {
      console.error("Bulk translation failed", err);
      setIsDownloading(false);
    }
  };

  const handleNextChapter = () => {
    const currentIndex = toc.findIndex(item => item.href === currentChapter);
    if (currentIndex !== -1 && currentIndex < toc.length - 1) {
      loadChapter(toc[currentIndex + 1].href);
    }
  };

  const handlePrevChapter = () => {
    const currentIndex = toc.findIndex(item => item.href === currentChapter);
    if (currentIndex > 0) {
      loadChapter(toc[currentIndex - 1].href);
    }
  };

  const renderTextWithHighlights = (text: string) => {
    if (!highlights.length) return text;

    // Filter highlights for current chapter
    const chapterHighlights = highlights.filter(h => h.chapterId === currentChapter);
    if (!chapterHighlights.length) return text;

    // Sort highlights by length (longest first) to handle potential nested-like text appearances 
    // although we split by exact match for now which is simple but prone to multiple matches.
    // Real EPUB highlighting usually uses CFI (Canonical Fragment Identifier), but since we extract text,
    // we'll use a text-replacement approach for this implementation.
    
    let parts: (string | React.ReactNode)[] = [text];

    chapterHighlights.forEach(hl => {
      const newParts: (string | React.ReactNode)[] = [];
      parts.forEach(part => {
        if (typeof part !== 'string') {
          newParts.push(part);
          return;
        }

        const index = part.indexOf(hl.text);
        if (index === -1) {
          newParts.push(part);
        } else {
            const colorMap = {
              yellow: 'bg-yellow-100 border-b-2 border-yellow-300',
              pink: 'bg-pink-100 border-b-2 border-pink-300',
              blue: 'bg-blue-100 border-b-2 border-blue-300',
              violet: 'bg-violet-100 border-b-2 border-violet-400',
              green: 'bg-green-100 border-b-2 border-green-300',
              orange: 'bg-violet-100 border-b-2 border-violet-300' // fallback or mapping
            };

          newParts.push(part.substring(0, index));
          newParts.push(
            <mark 
              key={hl.id} 
              className={`${colorMap[hl.color]} px-1 rounded-sm cursor-help relative group`}
              title={hl.note || 'Highlighted Text'}
            >
              {hl.text}
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  deleteHighlight(hl.id);
                }}
                className="absolute -top-6 left-1/2 -translate-x-1/2 bg-white shadow-lg rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-50 text-red-500 scale-75"
              >
                <Trash2 size={14} />
              </button>
            </mark>
          );
          newParts.push(part.substring(index + hl.text.length));
        }
      });
      parts = newParts;
    });

    return parts;
  };

  const themeColors = {
    light: 'bg-white text-gray-900',
    dark: 'bg-gray-900 text-gray-100',
    sepia: 'bg-[#f4ecd8] text-[#5b4636]'
  };

  return (
    <div id="reader-root" className={`fixed inset-0 z-50 flex flex-col font-serif ${themeColors[settings.theme]}`}>
      {/* Top Bar */}
      <header id="reader-header" className="flex h-16 items-center justify-between border-b border-gray-200/50 px-4 backdrop-blur-md">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 rounded-full p-2 hover:bg-gray-200/20"
        >
          <ChevronLeft size={24} />
          <span className="hidden md:inline font-sans font-medium">Library</span>
        </button>

        <div className="flex items-center gap-2">
           <button 
            onClick={() => setShowTOC(!showTOC)}
            className={`rounded-full p-2 hover:bg-gray-200/20 ${showTOC ? 'text-orange-500 bg-orange-50' : ''}`}
            title="Table of Contents"
          >
            <List size={22} />
          </button>
        </div>

        <div className="flex flex-col items-center flex-1 mx-4 min-w-0">
          <h2 className="line-clamp-1 text-base font-bold font-sans">{book.title}</h2>
          <p className="text-xs opacity-60 font-sans tracking-wide uppercase">Chapter Preview</p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              const modes: Settings['readerMode'][] = ['original', 'sideBySide', 'translated'];
              const currentIdx = modes.indexOf(settings.readerMode);
              const nextMode = modes[(currentIdx + 1) % modes.length];
              updateSettings({ readerMode: nextMode });
            }}
            className={`flex items-center gap-2 rounded-full px-4 py-2 hover:bg-gray-200/20 transition-all font-sans font-bold text-sm ${
              settings.readerMode !== 'original' ? 'text-violet-600 bg-violet-50 shadow-sm' : ''
            }`}
            title="Switch View Mode"
          >
            {settings.readerMode === 'original' && <><BookOpen size={18} /> Original</>}
            {settings.readerMode === 'sideBySide' && <><Columns size={18} /> Side-by-Side</>}
            {settings.readerMode === 'translated' && <><Languages size={18} /> Translated</>}
          </button>
          
          <button 
            onClick={() => setShowTools(!showTools)}
            className="rounded-full p-2 hover:bg-gray-200/20"
          >
            <Type size={20} />
          </button>
          <button 
             onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
             className="rounded-full p-2 hover:bg-gray-200/20"
          >
            {settings.theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main id="reader-content" className="relative flex-1 overflow-hidden flex">
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gray-100/50 z-30">
          <motion.div 
            className="h-full bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]"
            initial={{ width: 0 }}
            animate={{ width: `${scrollProgress}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        </div>

        {/* Left Sidebar (TOC) */}
        <AnimatePresence>
          {showTOC && (
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              className={`w-[300px] border-r border-gray-200/50 flex flex-col bg-white/50 backdrop-blur-xl z-40 shadow-2xl`}
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold font-sans flex items-center gap-2">
                  <List size={18} className="text-violet-500" />
                  Chapters
                </h3>
              </div>
              
              <div className="p-4 border-b border-gray-100">
                <button
                  onClick={downloadTranslatedBook}
                  disabled={isDownloading}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all relative overflow-hidden group ${
                    isDownloading 
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                      : 'bg-violet-600 text-white shadow-lg shadow-violet-200 hover:scale-[1.02] active:scale-[0.98]'
                  }`}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Translating {downloadProgress}%</span>
                      <div className="absolute bottom-0 left-0 h-1 bg-violet-400 transition-all duration-500" style={{ width: `${downloadProgress}%` }} />
                    </>
                  ) : (
                    <>
                      <Download size={18} />
                      <span>Download Translated Book</span>
                    </>
                  )}
                </button>
                {isDownloading && (
                  <p className="mt-2 text-[10px] text-center text-gray-400 font-bold uppercase tracking-widest animate-pulse">
                    This may take a moment...
                  </p>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {toc.map((chapter, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      loadChapter(chapter.href);
                      if (window.innerWidth < 768) setShowTOC(false);
                    }}
                    className={`w-full text-left px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
                      currentChapter === chapter.href 
                        ? 'bg-violet-500 text-white shadow-xl shadow-violet-200' 
                        : 'hover:bg-violet-50 text-gray-600'
                    }`}
                  >
                    <span className="line-clamp-2">{chapter.label}</span>
                  </button>
                ))}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <div className={`flex flex-1 transition-all duration-300 ${activeSidePanel !== 'none' ? 'md:mr-[400px]' : ''}`}>
          <div className="w-full flex h-full overflow-hidden">
             {/* Original Text */}
             {(settings.readerMode === 'original' || settings.readerMode === 'sideBySide') && (
               <div 
                 ref={scrollContainerRef}
                 onScroll={handleScroll}
                 onMouseUp={handleTextSelection}
                 className={`h-full overflow-y-auto px-8 py-12 transition-all selection:bg-orange-200 ${settings.readerMode === 'sideBySide' ? 'w-1/2 border-r border-gray-200/30' : 'w-full max-w-3xl mx-auto'}`}
                 style={{ fontSize: `${settings.fontSize}px`, lineHeight: '1.8' }}
               >
                  <div className="prose prose-lg max-w-none">
                    {originalText.split('\n').map((p, i) => (
                      <p key={i} className="mb-6 selection:bg-violet-200">{renderTextWithHighlights(p)}</p>
                    ))}
                  </div>
               </div>
             )}

             {/* Translated Text */}
             {(settings.readerMode === 'translated' || settings.readerMode === 'sideBySide') && (
               <div 
                className={`h-full overflow-y-auto px-8 py-12 bg-black/5 transition-all ${settings.readerMode === 'sideBySide' ? 'w-1/2' : 'w-full max-w-3xl mx-auto'}`}
                style={{ fontSize: `${settings.fontSize}px`, lineHeight: '1.8' }}
               >
                 {isTranslating ? (
                   <div className="flex flex-col items-center justify-center h-full gap-4">
                     <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
                     <p className="font-sans text-sm animate-pulse">Translating with Gemini AI...</p>
                   </div>
                 ) : translatedText ? (
                   <div className="prose prose-lg max-w-none opacity-90 italic">
                      {translatedText.split('\n').map((p, i) => (
                        <p key={i} className="mb-6">{renderTextWithHighlights(p)}</p>
                      ))}
                   </div>
                 ) : (
                   <div className="flex flex-col items-center justify-center h-full text-center">
                     <Languages size={48} className="mb-4 text-gray-300" />
                     <p className="max-w-xs font-sans text-gray-500 mb-6">
                       Tap the translate button to view this chapter in English.
                     </p>
                     <button 
                       onClick={handleTranslate}
                       className="rounded-full bg-orange-600 px-6 py-2 font-sans font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
                     >
                       Translate Chapter
                     </button>
                   </div>
                 )}
               </div>
             )}
          </div>
        </div>

        {/* Floating Controls */}
        <div id="reader-floating-actions" className="absolute bottom-10 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-gray-200/50 bg-white/10 p-2 shadow-2xl backdrop-blur-xl">
           <button 
             onClick={() => setActiveSidePanel(activeSidePanel === 'audio' ? 'none' : 'audio')}
             className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${activeSidePanel === 'audio' ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'hover:bg-white/20'}`}
             title="Audio Narration"
           >
             <Volume2 size={22} />
           </button>
          <button 
            onClick={() => setActiveSidePanel(activeSidePanel === 'notebook' ? 'none' : 'notebook')}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${activeSidePanel === 'notebook' ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'hover:bg-white/20'}`}
            title="Annotation Notebook"
          >
            <Notebook size={22} />
          </button>
          <button 
            onClick={() => setActiveSidePanel(activeSidePanel === 'chat' ? 'none' : 'chat')}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${activeSidePanel === 'chat' ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'hover:bg-white/20'}`}
            title="Text Chat"
          >
            <MessageSquare size={22} />
          </button>
          <button 
            onClick={() => setActiveSidePanel(activeSidePanel === 'voice' ? 'none' : 'voice')}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition-all ${activeSidePanel === 'voice' ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' : 'hover:bg-white/20'}`}
            title="Voice Conversation"
          >
            <Play size={22} />
          </button>
           <div className="h-8 w-[1px] bg-white/20 mx-1" />
           <button 
             onClick={handlePrevChapter}
             disabled={toc.findIndex(item => item.href === currentChapter) <= 0}
             className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
             title="Previous Chapter"
           >
             <ChevronLeft size={24} />
           </button>
           <button 
             onClick={handleNextChapter}
             disabled={toc.findIndex(item => item.href === currentChapter) >= toc.length - 1}
             className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
             title="Next Chapter"
           >
             <ChevronRight size={24} />
           </button>
        </div>

        {/* Side Panels */}
        <AnimatePresence>
          {activeSidePanel !== 'none' && (
             <motion.div 
               initial={{ x: 400 }}
               animate={{ x: 0 }}
               exit={{ x: 400 }}
               id="ai-side-panel"
               className="absolute right-0 top-0 bottom-0 w-full md:w-[400px] bg-white border-l border-gray-200 shadow-2xl z-50 text-gray-900"
             >
                <div className="flex h-16 items-center justify-between px-6 border-b border-gray-100">
                  <h3 className="font-bold flex items-center gap-2">
                    {activeSidePanel === 'chat' && <><MessageSquare size={18} className="text-violet-500" /> Discuss Book</>}
                    {activeSidePanel === 'voice' && <><Play size={18} className="text-violet-500" /> Voice Assistant</>}
                    {activeSidePanel === 'audio' && <><Volume2 size={18} className="text-violet-500" /> Audio Narration</>}
                    {activeSidePanel === 'notebook' && <><Notebook size={18} className="text-violet-500" /> Annotations</>}
                  </h3>
                  <button onClick={() => setActiveSidePanel('none')} className="text-gray-400 hover:text-gray-600">
                    <ChevronRight size={24} />
                  </button>
                </div>
                <div className="p-6 h-[calc(100%-64px)] overflow-y-auto">
                   {activeSidePanel === 'chat' && <Chat book={book} currentText={originalText} />}
                   {activeSidePanel === 'voice' && <VoiceChat book={book} currentText={originalText} />}
                   {activeSidePanel === 'audio' && (
                     <AudioPlayer 
                       isPlaying={isNarrationPlaying}
                       isLoading={isNarrationLoading}
                       currentTime={narrationTime}
                       duration={narrationDuration}
                       voice={narrationVoice}
                       speed={narrationSpeed}
                       onTogglePlay={toggleNarration}
                       onSeek={seekNarration}
                       onVoiceChange={(v) => {
                         setNarrationVoice(v);
                         setNarrationUrl(null); 
                       }}
                       onSpeedChange={setNarrationSpeed}
                       onAdvance={(sec) => {
                         if (globalAudioRef.current) globalAudioRef.current.currentTime += sec;
                       }}
                     />
                   )}
                   {activeSidePanel === 'notebook' && (
                     <div className="flex flex-col h-full space-y-6">
                       <div className="space-y-4">
                         <div className="relative">
                           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                           <input 
                             type="text" 
                             placeholder="Search highlights..."
                             value={notebookSearch}
                             onChange={(e) => setNotebookSearch(e.target.value)}
                             className="w-full rounded-xl border border-gray-100 bg-gray-50 py-2 pl-10 pr-4 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/10"
                           />
                         </div>

                         <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                           <button 
                             onClick={() => setHighlightFilter('all')}
                             className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${highlightFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-400'}`}
                           >
                             All
                           </button>
                           {(['yellow', 'pink', 'blue', 'orange', 'green'] as const).map(color => (
                              <button 
                                key={color}
                                onClick={() => setHighlightFilter(color)}
                                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${highlightFilter === color ? 'ring-2 ring-offset-2 ring-gray-900' : 'opacity-40 hover:opacity-100'}`}
                                style={{ backgroundColor: color === 'yellow' ? '#fef08a' : color === 'pink' ? '#fbcfe8' : color === 'blue' ? '#bfdbfe' : color === 'orange' ? '#ffedd5' : '#bbf7d0', color: 'black' }}
                              >
                                {color}
                              </button>
                           ))}
                         </div>
                       </div>

                       <div className="flex-1 overflow-y-auto space-y-8 pr-2 scrollbar-thin">
                         {(() => {
                           const filtered = highlights
                             .filter(h => (highlightFilter === 'all' || h.color === highlightFilter) && 
                                         (!notebookSearch || h.text.toLowerCase().includes(notebookSearch.toLowerCase())))
                             .sort((a, b) => b.createdAt - a.createdAt);

                           // Group highlights by chapter
                           const groups: Record<string, Highlight[]> = {};
                           filtered.forEach(h => {
                             if (!groups[h.chapterId]) groups[h.chapterId] = [];
                             groups[h.chapterId].push(h);
                           });

                           return Object.entries(groups).map(([chapterHref, chapterHls]) => {
                             const chapterLabel = toc.find(t => t.href === chapterHref)?.label || 'Unknown Chapter';
                             return (
                               <div key={chapterHref} className="space-y-4">
                                 <div className="flex items-center gap-2">
                                   <div className="h-px flex-1 bg-gray-100" />
                                   <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">
                                     {chapterLabel}
                                   </span>
                                   <div className="h-px flex-1 bg-gray-100" />
                                 </div>
                                 <div className="space-y-4">
                                   {chapterHls.map(hl => (
                                     <motion.div 
                                       layout
                                       key={hl.id} 
                                       className="group relative p-4 rounded-3xl bg-gray-50 border border-gray-100 transition-all hover:bg-white hover:shadow-xl group"
                                     >
                                       <div className="flex items-start justify-between mb-2">
                                         <div 
                                           className="h-3 w-3 rounded-full mr-2 mt-1" 
                                           style={{ backgroundColor: hl.color === 'yellow' ? '#facc15' : hl.color === 'pink' ? '#ec4899' : hl.color === 'blue' ? '#3b82f6' : hl.color === 'orange' ? '#f97316' : '#22c55e' }}
                                         />
                                         <button 
                                           onClick={() => deleteHighlight(hl.id)}
                                           className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                         >
                                           <Trash2 size={16} />
                                         </button>
                                       </div>
                                       <p className="text-sm font-serif line-clamp-4 leading-relaxed mb-3">"{hl.text}"</p>
                                       <div className="flex items-center justify-between">
                                         <span className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">
                                           {new Date(hl.createdAt).toLocaleDateString()}
                                         </span>
                                         <button 
                                           onClick={() => loadChapter(hl.chapterId)}
                                           className="text-[10px] uppercase tracking-widest font-bold text-violet-600 hover:underline"
                                         >
                                           Go to Text
                                         </button>
                                       </div>
                                     </motion.div>
                                   ))}
                                 </div>
                               </div>
                             );
                           });
                         })()}
                       </div>
                     </div>
                   )}
                </div>
             </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Highlight Menu */}
        <AnimatePresence>
          {selection && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 10 }}
              className="fixed z-[100] flex items-center gap-2 p-2 bg-gray-900 rounded-full shadow-2xl border border-white/10 backdrop-blur-xl"
              style={{
                top: Math.max(80, selection.rect.top - 60),
                left: Math.max(20, Math.min(window.innerWidth - 300, selection.rect.left + selection.rect.width / 2 - 125))
              }}
            >
              {(['yellow', 'pink', 'blue', 'orange', 'green'] as const).map(color => (
                <button
                  key={color}
                  onClick={() => addHighlight(color)}
                  className="h-8 w-8 rounded-full border-2 border-transparent hover:border-white transition-all transform hover:scale-110"
                  style={{ backgroundColor: color === 'yellow' ? '#facc15' : color === 'pink' ? '#ec4899' : color === 'blue' ? '#3b82f6' : color === 'orange' ? '#f97316' : '#22c55e' }}
                  title={`Highlight in ${color}`}
                />
              ))}
              <div className="h-6 w-[1px] bg-white/20 mx-1" />
              <button 
                onClick={() => {
                  window.getSelection()?.removeAllRanges();
                  setSelection(null);
                }}
                className="p-1.5 text-white/60 hover:text-white"
              >
                <Trash2 size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Settings Overlay */}
      <AnimatePresence>
        {showTools && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTools(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm z-50"
            />
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="absolute bottom-24 left-1/2 -translate-x-1/2 w-full max-w-sm bg-white rounded-3xl shadow-2xl z-[60] p-6 text-gray-900"
            >
              <h4 className="font-bold text-lg mb-4">Reading Settings</h4>
              <div className="space-y-6">
                <div>
                  <p className="text-xs font-bold uppercase text-gray-400 mb-3 tracking-widest">Font Size</p>
                  <div className="flex items-center gap-4">
                    <button onClick={() => updateSettings({ fontSize: Math.max(12, settings.fontSize - 2) })} className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200">
                       <span className="text-xs">A</span>
                    </button>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                       <div className="h-full bg-violet-600" style={{ width: `${((settings.fontSize - 12) / 28) * 100}%` }} />
                    </div>
                    <button onClick={() => updateSettings({ fontSize: Math.min(40, settings.fontSize + 2) })} className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200">
                       <span className="text-lg font-bold">A</span>
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-gray-400 mb-3 tracking-widest">Reader Mode</p>
                  <div className="flex gap-2">
                    {(['original', 'sideBySide', 'translated'] as const).map(mode => (
                      <button 
                        key={mode}
                        onClick={() => updateSettings({ readerMode: mode })}
                        className={`flex-1 h-12 rounded-xl border-2 transition-all capitalize font-medium text-xs ${
                          settings.readerMode === mode ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-100 bg-gray-50'
                        }`}
                      >
                        {mode === 'sideBySide' ? 'Split' : mode}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase text-gray-400 mb-3 tracking-widest">Appearance</p>
                  <div className="flex gap-3">
                    {(['light', 'dark', 'sepia'] as const).map(t => (
                      <button 
                        key={t}
                        onClick={() => updateSettings({ theme: t })}
                        className={`flex-1 h-12 rounded-xl border-2 transition-all capitalize font-medium ${
                          settings.theme === t ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-100 bg-gray-50'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* Global Narration Audio */}
      <audio 
        ref={globalAudioRef}
        src={narrationUrl || undefined}
        onTimeUpdate={handleNarrationTimeUpdate}
        onLoadedMetadata={handleNarrationTimeUpdate}
        onEnded={() => setIsNarrationPlaying(false)}
        className="hidden"
      />

      {/* Mini Player */}
      <AnimatePresence>
        {narrationUrl && activeSidePanel !== 'audio' && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 right-6 z-[60] flex items-center gap-4 bg-white/80 backdrop-blur-2xl border border-violet-100 p-2 pr-6 rounded-full shadow-2xl"
          >
            <button 
              onClick={toggleNarration}
              className="h-10 w-10 flex items-center justify-center rounded-full bg-violet-600 text-white shadow-lg"
            >
              {isNarrationPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase text-violet-600 tracking-widest line-clamp-1 max-w-[100px]">
                Narration Active
              </span>
              <div className="h-1 w-24 bg-violet-100 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-violet-500" style={{ width: `${(narrationTime/narrationDuration) * 100}%` }} />
              </div>
            </div>
            <button 
              onClick={() => setActiveSidePanel('audio')}
              className="text-gray-400 hover:text-violet-600 transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
