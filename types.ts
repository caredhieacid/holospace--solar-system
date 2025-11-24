export interface MoonData {
  name: string;
  size: number;
  distance: number;
  speed: number;
  color: string;
}

export interface PlanetData {
  name: string;
  color: string;
  size: number;
  distance: number;
  speed: number;
  description: string;
  scienceFacts: string;
  moons?: MoonData[];
}

export enum ChatMode {
  TEXT = 'TEXT',
  AUDIO = 'AUDIO' // Gemini Live
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  image?: string;
  sources?: string[];
  isThinking?: boolean;
}

export type VeoModel = 'veo-3.1-fast-generate-preview' | 'veo-3.1-generate-preview';
export type ImageModel = 'gemini-3-pro-image-preview' | 'gemini-2.5-flash-image';

// Window extension for Veo key selection
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}