import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { ChatMessage } from '../types';

// --- Initialization ---
// Create a new instance with fresh API key every time to handle potential key updates (e.g. Veo)
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Text & Chat (with Tools & Thinking) ---
export const sendMessage = async (
  history: ChatMessage[],
  currentMessage: string,
  imagePart?: string,
  useThinking: boolean = false,
  useSearch: boolean = false,
  useMaps: boolean = false
): Promise<{ text: string; sources?: string[] }> => {
  const ai = getAI();
  const model = useThinking ? 'gemini-3-pro-preview' : 'gemini-2.5-flash';
  
  const tools = [];
  if (useSearch) tools.push({ googleSearch: {} });
  if (useMaps) tools.push({ googleMaps: {} });

  const config: any = {
    tools: tools.length > 0 ? tools : undefined,
  };

  if (useThinking) {
    config.thinkingConfig = { thinkingBudget: 32768 };
  }
  
  let systemInstruction = "你是一个太阳系教育应用的全息助手。请用中文回答用户的问题，内容要科学、有趣。";
  
  if (imagePart) {
     // For multimodal, use generateContent with structured contents
     const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview', // Use Pro for multimodal analysis
        contents: {
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: imagePart } },
              { text: currentMessage }
            ]
        },
        config: config
     });
     return { text: response.text || "我已分析了图片。", sources: [] };
  } else {
    // Chat mode
    const chat = ai.chats.create({
        model: model,
        config: { ...config, systemInstruction }
    });
    
    // In a real app we would load history here. 
    // chat.history = ...
    
    const result = await chat.sendMessage({ message: currentMessage });
    
    // Extract grounding
    let sources: string[] = [];
    const chunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
        chunks.forEach((c: any) => {
            if (c.web?.uri) sources.push(c.web.uri);
            if (c.maps?.uri) sources.push(c.maps.uri);
        });
    }

    return { text: result.text || "", sources };
  }
};

// --- Image Generation ---
export const generateImage = async (
    prompt: string, 
    aspectRatio: string = "1:1",
    size: "1K" | "2K" | "4K" = "1K"
): Promise<string> => {
    const ai = getAI();
    const model = 'gemini-3-pro-image-preview';
    
    const response = await ai.models.generateContent({
        model,
        contents: { parts: [{ text: prompt }] },
        config: {
            imageConfig: {
                aspectRatio: aspectRatio as any,
                imageSize: size
            }
        }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
        }
    }
    throw new Error("No image generated");
};

// --- Image Editing (Nano Banana) ---
export const editImage = async (base64Image: string, prompt: string): Promise<string> => {
    const ai = getAI();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [
                { inlineData: { mimeType: 'image/png', data: base64Image } },
                { text: prompt }
            ]
        }
    });
    
    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            return `data:image/png;base64,${part.inlineData.data}`;
        }
    }
    return "";
};

// --- Video Generation (Veo) ---
export const checkVeoKey = async () => {
    const win = window as any;
    if (win.aistudio && win.aistudio.hasSelectedApiKey) {
        const hasKey = await win.aistudio.hasSelectedApiKey();
        if (!hasKey && win.aistudio.openSelectKey) {
             await win.aistudio.openSelectKey();
        }
        return true;
    }
    return false;
};

export const generateVideo = async (
    prompt: string, 
    imageInput?: string,
    aspectRatio: '16:9' | '9:16' = '16:9'
): Promise<string> => {
    const ai = getAI();
    
    let config: any = {
        numberOfVideos: 1,
        resolution: '1080p',
        aspectRatio: aspectRatio
    };

    let request: any = {
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: config
    };

    if (imageInput) {
        request.image = {
            imageBytes: imageInput,
            mimeType: 'image/png'
        };
    }

    let operation = await ai.models.generateVideos(request);
    
    while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation });
    }

    const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) throw new Error("Video generation failed");
    
    return `${uri}&key=${process.env.API_KEY}`;
};

// --- Audio Transcription ---
export const transcribeAudio = async (base64Audio: string): Promise<string> => {
    const ai = getAI();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                { inlineData: { mimeType: 'audio/mp3', data: base64Audio } }, 
                { text: "请准确转录这段音频。" }
            ]
        }
    });
    return response.text || "";
};

// --- Text to Speech ---
export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
    const ai = getAI();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: { parts: [{ text }] },
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
            }
        }
    });
    
    const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64) throw new Error("No audio generated");
    
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
};

// --- Live API (Real-time) ---
export const connectLive = async (
    onAudioData: (buffer: ArrayBuffer) => void,
    onTranscript: (input: string, output: string) => void
) => {
    const ai = getAI();
    const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: "你是一个名为 Astra 的全息 AI 助手。请用简练、对话式的中文回答。"
        },
        callbacks: {
            onopen: () => console.log("Live session connected"),
            onmessage: (msg: LiveServerMessage) => {
                const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (audioData) {
                    const binaryString = atob(audioData);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    onAudioData(bytes.buffer);
                }
                
                const inputT = msg.serverContent?.inputTranscription?.text;
                const outputT = msg.serverContent?.outputTranscription?.text;
                if (inputT || outputT) {
                    onTranscript(inputT || '', outputT || '');
                }
            },
            onclose: () => console.log("Live session closed"),
            onerror: (e) => console.error("Live session error", e)
        }
    });

    return sessionPromise;
};