import ePub, { Book, Rendition } from 'epubjs';

export class EpubProcessor {
  private book: Book | null = null;
  private rendition: Rendition | null = null;

  async loadBook(data: ArrayBuffer | string): Promise<Book> {
    this.book = ePub(data);
    await this.book.ready;
    return this.book;
  }

  async getMetadata() {
    if (!this.book) throw new Error("Book not loaded");
    return await (this.book as any).package.metadata;
  }

  async getTOC() {
    if (!this.book) throw new Error("Book not loaded");
    const navigation = await this.book.loaded.navigation;
    return navigation.toc;
  }

  async getCover() {
    if (!this.book) throw new Error("Book not loaded");
    return await this.book.coverUrl();
  }

  async getChapterText(href: string): Promise<string> {
    if (!this.book) throw new Error("Book not loaded");
    const item = this.book.spine.get(href);
    if (!item) return "";
    
    try {
      const doc = await item.load(this.book.load.bind(this.book));
      if (!doc) return "";
      
      // Safety check for body or textContent
      const body = doc.body || doc.getElementsByTagName("body")[0];
      if (!body) {
        // Fallback for documents without a body tag (rare but possible in some XML)
        return doc.documentElement?.textContent || "";
      }
      
      return body.innerText || body.textContent || "";
    } catch (err) {
      console.error("Failed to load chapter text", err);
      return "";
    }
  }
  
  // Method to render to a DOM element
  renderTo(element: HTMLElement, options: any = {}) {
     if (!this.book) throw new Error("Book not loaded");
     this.rendition = this.book.renderTo(element, {
       width: "100%",
       height: "100%",
       ...options
     });
     return this.rendition;
  }
}
