import React, { useState, useEffect } from 'react';
import { Header } from './components/common/Header';
import { LibraryView } from './components/LibraryView';
import { Reader } from './components/Reader';
import { Book, Settings } from './types';
import { EpubProcessor } from './services/epubService';
import { AnimatePresence, motion } from 'motion/react';
import { auth, db, signIn, signOut, handleFirestoreError } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, doc, setDoc, getDocs, deleteDoc, query, onSnapshot, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';

export default function App() {
  const [view, setView] = useState<'library' | 'reader' | 'settings'>('library');
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>({
    fontSize: 18,
    theme: 'light',
    readerMode: 'original',
  });

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        // Create user doc if not exists
        const userRef = doc(db, 'users', u.uid);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) {
          await setDoc(userRef, {
            userId: u.uid,
            email: u.email,
            displayName: u.displayName,
            settings: settings,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        } else {
          const data = userDoc.data();
          if (data?.settings) {
            setSettings(data.settings);
          }
        }
      } else {
        // Load local books if guest
        const savedBooks = localStorage.getItem('linguist_books');
        if (savedBooks) {
          try {
            setBooks(JSON.parse(savedBooks));
          } catch (e) {
            console.error("Failed to parse saved books", e);
          }
        }
      }
    });
    return unsubscribe;
  }, []);

  // Sync books from Firestore when logged in
  useEffect(() => {
    if (!user) return;

    const booksRef = collection(db, 'users', user.uid, 'books');
    const unsubscribe = onSnapshot(booksRef, async (snapshot) => {
      const fbBooks: Book[] = [];
      for (const docSnap of snapshot.docs) {
        const bookData = docSnap.data();
        
        // Fetch chunks if not in memory (simplified: fetch all for now, but in reality would lazy load)
        const chunksRef = collection(db, 'users', user.uid, 'books', docSnap.id, 'chunks');
        const chunksSnap = await getDocs(chunksRef);
        const sortedChunks = chunksSnap.docs
          .map(d => d.data())
          .sort((a, b) => a.chunkIndex - b.chunkIndex);
        
        const fullBase64 = sortedChunks.map(c => c.data).join('');
        
        fbBooks.push({
          id: docSnap.id,
          title: bookData.title,
          author: bookData.author,
          cover: bookData.cover,
          originalLanguage: bookData.originalLanguage,
          fileData: fullBase64,
          addedAt: bookData.addedAt,
          category: bookData.category
        });
      }
      setBooks(fbBooks);
    });

    return unsubscribe;
  }, [user]);

  // Save guest books to localStorage
  useEffect(() => {
    if (!user) {
      localStorage.setItem('linguist_books', JSON.stringify(books));
    }
  }, [books, user]);

  const handleUpload = async (file: File) => {
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const uint8 = new Uint8Array(arrayBuffer);
        
        const processor = new EpubProcessor();
        const epubBook = await processor.loadBook(arrayBuffer);
        const metadata = await processor.getMetadata();
        const cover = await processor.getCover();

        const bookId = crypto.randomUUID();
        
        // Safer way to convert Uint8Array to base64 for large files
        let binary = '';
        const len = uint8.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64 = btoa(binary);

        const newBook: Book = {
          id: bookId,
          title: metadata.title || file.name,
          author: metadata.creator || 'Unknown Author',
          cover: cover || undefined,
          originalLanguage: metadata.language || 'Unknown',
          fileData: base64,
          addedAt: Date.now(),
        };

        if (user) {
          // Upload to Firestore
          const bookRef = doc(db, 'users', user.uid, 'books', bookId);
          await setDoc(bookRef, {
            id: bookId,
            ownerId: user.uid,
            title: newBook.title,
            author: newBook.author,
            cover: newBook.cover || null,
            originalLanguage: newBook.originalLanguage,
            addedAt: newBook.addedAt,
            updatedAt: Date.now()
          });

          // Chunk data (Firestore limit is 1MB)
          const CHUNK_SIZE = 800000; // ~800KB to be safe with base64 overhead
          const chunks = [];
          for (let i = 0; i < base64.length; i += CHUNK_SIZE) {
            chunks.push(base64.substring(i, i + CHUNK_SIZE));
          }

          for (let i = 0; i < chunks.length; i++) {
            const chunkRef = doc(db, 'users', user.uid, 'books', bookId, 'chunks', `chunk_${i}`);
            await setDoc(chunkRef, {
              bookId: bookId,
              chunkIndex: i,
              data: chunks[i]
            });
          }
        } else {
          setBooks(prev => [newBook, ...prev]);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error("Upload failed", error);
      alert("Failed to upload book. Please try another EPUB file.");
    }
  };

  const handleSelectBook = (book: Book) => {
    // Convert base64 back to ArrayBuffer
    const binaryString = atob(book.fileData as string);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const processedBook = {
      ...book,
      fileData: bytes.buffer
    };
    setSelectedBook(processedBook);
    setView('reader');
  };

  const handleDeleteBook = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this book?")) {
      if (user) {
        try {
          const bookRef = doc(db, 'users', user.uid, 'books', id);
          await deleteDoc(bookRef);
          // Sub-collections should be cleaned up too, but Firestore doesn't do it automatically
          // For this app, we'll assume the client deletes them or use a trigger (not available here)
          // To keep it simple, we just delete the main doc for now.
        } catch (err) {
          handleFirestoreError(err, 'delete', `users/${user.uid}/books/${id}`);
        }
      } else {
        setBooks(prev => prev.filter(b => b.id !== id));
      }
    }
  };

  const updateSettings = async (partial: Partial<Settings>) => {
    const newSettings = { ...settings, ...partial };
    setSettings(newSettings);
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        settings: newSettings,
        updatedAt: serverTimestamp()
      });
    }
  };

  const handleUpdateBook = async (updatedBook: Book) => {
    if (user) {
      const bookRef = doc(db, 'users', user.uid, 'books', updatedBook.id);
      await updateDoc(bookRef, {
        category: updatedBook.category || null,
        updatedAt: Date.now()
      });
    } else {
      setBooks(prev => prev.map(b => b.id === updatedBook.id ? updatedBook : b));
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
        <p className="mt-4 font-bold text-gray-500 uppercase tracking-widest text-xs">Texta</p>
      </div>
    );
  }

  return (
    <div id="app-root" className="min-h-screen bg-white text-gray-900 font-sans">
      <Header 
        activeView={view} 
        user={user}
        onSignIn={signIn}
        onSignOut={signOut}
        onNavChange={(v) => {
          setView(v);
          if (v === 'library') setSelectedBook(null);
        }} 
      />
      
      <main id="main-scroll-area">
        <AnimatePresence mode="wait">
          {view === 'library' && (
            <motion.div
              key="library"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <LibraryView 
                books={books} 
                onUpload={handleUpload} 
                onSelectBook={handleSelectBook}
                onDeleteBook={handleDeleteBook}
                onUpdateBook={handleUpdateBook}
              />
            </motion.div>
          )}

          {view === 'reader' && selectedBook && (
            <motion.div
              key="reader"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
            >
              <Reader 
                book={selectedBook} 
                onBack={() => setView('library')}
                settings={settings}
                updateSettings={updateSettings}
                user={user}
              />
            </motion.div>
          )}

          {view === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="container mx-auto px-4 py-12 max-w-2xl"
            >
              <h1 className="text-3xl font-bold mb-6">Settings</h1>
              <div className="bg-gray-50 rounded-3xl p-8 border border-gray-100">
                <div className="space-y-6">
                   <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold">Cloud Sync</p>
                        <p className="text-xs text-gray-500">
                          {user ? 'Your books and settings are synced to the cloud.' : 'Sign in to enable cloud synchronization.'}
                        </p>
                      </div>
                      <div className={`h-6 w-11 rounded-full relative transition-colors ${user ? 'bg-violet-600' : 'bg-gray-200'}`}>
                         <div className={`absolute top-1 h-4 w-4 bg-white rounded-full transition-all ${user ? 'right-1' : 'left-1'}`} />
                      </div>
                   </div>
                   
                   <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold">Reader Mode</p>
                        <p className="text-xs text-gray-500">Choose how you want to read translated books.</p>
                      </div>
                      <div className="flex gap-2">
                         {(['original', 'sideBySide', 'translated'] as const).map(mode => (
                           <button
                             key={mode}
                             onClick={() => updateSettings({ readerMode: mode })}
                             className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-all ${
                               settings.readerMode === mode 
                                 ? 'bg-violet-600 text-white border-violet-600 shadow-md' 
                                 : 'bg-white text-gray-400 border-gray-100 hover:border-violet-200'
                             }`}
                           >
                             {mode === 'sideBySide' ? 'Split' : mode}
                           </button>
                         ))}
                      </div>
                   </div>
                   
                   <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold">Local Data</p>
                        <p className="text-xs text-gray-500">Currently using {Math.round(JSON.stringify(books).length / 1024 / 1024 * 10) / 10} MB</p>
                      </div>
                      <button 
                        onClick={() => {
                          if (window.confirm("Clear all local data? This won't affect your cloud books.")) {
                            localStorage.removeItem('linguist_books');
                            if (!user) setBooks([]);
                          }
                        }}
                        className="text-xs font-bold text-red-600 uppercase tracking-widest hover:underline"
                      >
                        Clear Data
                      </button>
                   </div>

                   {!user && (
                     <div className="mt-8 p-6 bg-violet-50 rounded-[2rem] border border-violet-100">
                        <p className="text-sm text-violet-900 font-bold tracking-tight">Access your library everywhere.</p>
                        <p className="text-xs text-violet-700/60 mt-1">Create an account to sync your collection and highlights across devices.</p>
                        <button 
                          onClick={signIn}
                          className="mt-4 w-full rounded-2xl bg-gray-900 py-3 text-sm font-bold text-white hover:bg-black transition-all shadow-xl"
                        >
                          Sign In with Google
                        </button>
                     </div>
                   )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer id="app-footer" className="mt-20 border-t border-gray-50 py-16">
        <div className="container mx-auto px-4 text-center">
            <p className="text-sm font-black text-gray-900 uppercase tracking-widest">Texta</p>
            <p className="mt-2 text-[10px] text-gray-400 max-w-sm mx-auto leading-relaxed">
              Elevating the digital reading experience through artificial intelligence and refined typography.
            </p>
        </div>
      </footer>
    </div>
  );
}
