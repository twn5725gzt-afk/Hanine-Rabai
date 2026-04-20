import React, { useState, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, BookOpen, Trash2, Clock, Languages, Search, Layers, ChevronRight, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Book } from '../types';

interface LibraryViewProps {
  books: Book[];
  onUpload: (file: File) => void;
  onSelectBook: (book: Book) => void;
  onDeleteBook: (id: string) => void;
  onUpdateBook?: (book: Book) => void;
}

type SortOption = 'recent' | 'title' | 'author';

export const LibraryView: React.FC<LibraryViewProps> = ({ books, onUpload, onSelectBook, onDeleteBook, onUpdateBook }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = useMemo(() => {
    const cats = new Set<string>(['All']);
    books.forEach(b => {
      if (b.category) cats.add(b.category);
    });
    return Array.from(cats);
  }, [books]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onUpload(acceptedFiles[0]);
      }
    },
    accept: {
      'application/epub+zip': ['.epub'],
    },
    multiple: false,
  } as any);

  const filteredAndSortedBooks = useMemo(() => {
    let result = [...books];

    if (selectedCategory !== 'All') {
      result = result.filter(b => b.category === selectedCategory);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(b => 
        b.title.toLowerCase().includes(q) || 
        b.author.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      if (sortBy === 'recent') return b.addedAt - a.addedAt;
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'author') return a.author.localeCompare(b.author);
      return 0;
    });

    return result;
  }, [books, searchQuery, sortBy, selectedCategory]);

  return (
    <div id="library-container" className="container mx-auto px-4 py-8">
      <div className="mb-10 flex flex-col gap-8">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tight">Texta</h1>
            <p className="text-gray-500 font-medium">Your personal digital library, refined.</p>
          </div>
          
          <div 
            {...getRootProps()} 
            id="upload-dropzone"
            className={`group flex cursor-pointer items-center gap-3 rounded-3xl border-2 border-dashed px-8 py-4 transition-all ${
              isDragActive ? 'border-violet-400 bg-violet-50/50' : 'border-gray-200 bg-gray-50 hover:border-violet-300 hover:bg-white hover:shadow-xl'
            }`}
          >
            <input {...getInputProps()} />
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 transition-transform group-hover:scale-110">
              <Upload size={22} />
            </div>
            <div>
              <p className="font-bold text-gray-900">Add Book</p>
              <p className="text-[10px] uppercase font-black tracking-widest text-gray-400">EPUB format</p>
            </div>
          </div>
        </div>

        {/* Collections & Filters */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <Layers size={18} className="mr-2 text-gray-400" />
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-5 py-2 text-xs font-bold transition-all ${
                  selectedCategory === cat 
                    ? 'bg-violet-500 text-white shadow-lg shadow-violet-100' 
                    : 'bg-white border border-gray-100 text-gray-500 hover:bg-gray-50 hover:border-violet-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-gray-200 hidden lg:block mx-2" />

          <div className="flex flex-col gap-4 md:flex-row md:items-center flex-1">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Find a book..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full border border-gray-100 bg-white py-3 pl-12 pr-4 transition-all focus:border-violet-400 focus:outline-none focus:ring-4 focus:ring-violet-500/5 shadow-sm"
              />
            </div>
            
            <div className="flex items-center gap-1 rounded-full border border-gray-100 bg-white p-1 shadow-sm">
              {(['recent', 'title', 'author'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setSortBy(option)}
                  className={`rounded-full px-5 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
                    sortBy === option ? 'bg-gray-900 text-white shadow-md' : 'text-gray-400 hover:bg-gray-50'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {filteredAndSortedBooks.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          id="empty-library"
          className="flex flex-col items-center justify-center rounded-[3rem] bg-violet-50/30 py-32 text-center border border-violet-100/50"
        >
          <div className="mb-6 rounded-full bg-white p-8 shadow-xl shadow-violet-100/20">
            {searchQuery ? <Search size={64} className="text-violet-200" /> : <BookOpen size={64} className="text-violet-200" />}
          </div>
          <h3 className="text-2xl font-black text-gray-900">
            {searchQuery ? 'No match found' : 'Start your library'}
          </h3>
          <p className="max-w-xs mt-2 text-gray-500 font-medium leading-relaxed">
            {searchQuery ? `Nothing matches "${searchQuery}" in your collection.` : 'Your literary journey starts here. Upload your first EPUB to begin.'}
          </p>
        </motion.div>
      ) : (
        <div id="books-grid" className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 md:gap-4">
          <AnimatePresence mode="popLayout">
            {filteredAndSortedBooks.map((book) => (
              <motion.div
                key={book.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                id={`book-card-${book.id}`}
                className="group relative flex flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white transition-all hover:shadow-2xl hover:shadow-violet-100/50 hover:border-violet-200"
              >
                <div 
                  className="relative aspect-[2/3] cursor-pointer overflow-hidden bg-gray-50"
                  onClick={() => onSelectBook(book)}
                >
                  {Date.now() - book.addedAt < 24 * 60 * 60 * 1000 && (
                    <div className="absolute left-3 top-3 z-10 rounded-full bg-violet-500 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-lg">
                      New
                    </div>
                  )}
                  {book.cover ? (
                    <img 
                      src={book.cover} 
                      alt={book.title} 
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center p-6 text-center bg-gradient-to-br from-violet-50 to-white">
                      <span className="text-sm font-black text-violet-800/20 line-clamp-3 uppercase tracking-tighter">{book.title}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-violet-900/0 transition-colors group-hover:bg-violet-900/10" />
                  
                  <div className="absolute inset-x-3 bottom-3 translate-y-12 transition-transform group-hover:translate-y-0">
                    <button className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-900 shadow-xl backdrop-blur-xl">
                      Read
                    </button>
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-3 md:p-4">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h3 className="line-clamp-1 text-sm font-bold text-gray-900 group-hover:text-violet-600 transition-colors uppercase tracking-tight">{book.title}</h3>
                  </div>
                  <p className="line-clamp-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{book.author}</p>
                  
                  <div className="mt-3 flex items-center justify-between">
                     {book.category ? (
                        <div className="flex items-center gap-1 text-[9px] font-black text-violet-400 uppercase tracking-widest">
                           <Tag size={10} />
                           {book.category}
                        </div>
                     ) : (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const cat = prompt('Enter a category for this book:');
                            if (cat && onUpdateBook) {
                              onUpdateBook({ ...book, category: cat });
                            }
                          }}
                          className="flex items-center gap-1 text-[9px] font-black text-gray-300 hover:text-violet-400 uppercase tracking-widest transition-colors"
                        >
                           <Tag size={10} />
                           Tag
                        </button>
                     )}
                     
                     <button 
                        onClick={(e) => { e.stopPropagation(); onDeleteBook(book.id); }}
                        className="text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};
