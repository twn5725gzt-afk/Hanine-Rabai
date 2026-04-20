export interface Book {
  id: string;
  title: string;
  author: string;
  cover?: string;
  originalLanguage: string;
  fileData: ArrayBuffer | string; // Base64 or ArrayBuffer
  addedAt: number;
  category?: string;
}

export interface Translation {
  bookId: string;
  chapterId: string;
  originalText: string;
  translatedText: string;
  language: string;
}

export interface Highlight {
  id: string;
  bookId: string;
  chapterId: string;
  text: string;
  color: 'yellow' | 'pink' | 'blue' | 'orange' | 'green';
  note?: string;
  createdAt: number;
}

export interface Settings {
  fontSize: number;
  theme: 'light' | 'dark' | 'sepia';
  readerMode: 'original' | 'sideBySide' | 'translated';
}
