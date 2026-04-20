import { GoogleGenAI } from "@google/genai";

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

export const TRANSLATION_MODEL = "gemini-3-flash-preview";
export const CHAT_MODEL = "gemini-3.1-pro-preview";
export const TTS_MODEL = "gemini-3.1-flash-tts-preview";
export const LIVE_MODEL = "gemini-3.1-flash-live-preview";
