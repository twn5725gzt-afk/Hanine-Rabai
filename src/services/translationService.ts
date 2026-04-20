import { ai, TRANSLATION_MODEL } from "../lib/gemini";

export async function translateText(text: string, targetLanguage: string = "English"): Promise<string> {
  if (!text.trim()) return "";

  try {
    const response = await ai.models.generateContent({
      model: TRANSLATION_MODEL,
      contents: `Translate the following text into ${targetLanguage}. Preserve the tone and formatting. Only return the translated text:\n\n${text}`,
    });

    return response.text || "";
  } catch (error) {
    console.error("Translation error:", error);
    return "Translation failed. Please check your connection.";
  }
}

export async function translateChunked(text: string, targetLanguage: string = "English"): Promise<string> {
  // Simple chunking logic for large texts
  const MAX_CHUNK_SIZE = 5000;
  if (text.length <= MAX_CHUNK_SIZE) {
    return translateText(text, targetLanguage);
  }

  const paragraphs = text.split('\n');
  let translatedContent = "";
  let currentChunk = "";

  for (const p of paragraphs) {
    if ((currentChunk + p).length > MAX_CHUNK_SIZE) {
      translatedContent += await translateText(currentChunk, targetLanguage) + "\n";
      currentChunk = p;
    } else {
      currentChunk += (currentChunk ? "\n" : "") + p;
    }
  }

  if (currentChunk) {
    translatedContent += await translateText(currentChunk, targetLanguage);
  }

  return translatedContent;
}
