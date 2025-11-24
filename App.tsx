import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Mic, MicOff, X, RotateCcw, Sparkles, Settings
} from 'lucide-react';
import SolarSystemScene from './components/SolarSystemScene';
import HandController from './components/HandController';
import { PlanetData } from './types';
import * as Gemini from './services/geminiService';

// Updated Cursor to show gesture state and triple pinch progress
const CursorOverlay: React.FC<{ 
    handPosRef: React.MutableRefObject<{ 
        x: number, y: number, gestureType: 'none' | 'select' | 'rotate', rotationAngle: number, pinchProgress: number 
    }> 
}> = ({ handPosRef }) => {
    const cursorRef = useRef<HTMLDivElement>(null);
    const ringRef = useRef<HTMLDivElement>(null);
    const dotsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let rAF: number;
        const update = () => {
            if (cursorRef.current && ringRef.current && dotsRef.current) {
                const { x, y, gestureType, rotationAngle, pinchProgress } = handPosRef.current;
                
                cursorRef.current.style.transform = `translate(${x * window.innerWidth}px, ${y * window.innerHeight}px)`;
                
                // Dots for Triple Click Progress
                const dots = dotsRef.current.children;
                for (let i = 0; i < 3; i++) {
                    const dot = dots[i] as HTMLElement;
                    if (i < pinchProgress) {
                        dot.style.backgroundColor = '#22c55e'; // Green
                        dot.style.transform = 'scale(1.2)';
                        dot.style.boxShadow = '0 0 8px #22c55e';
                    } else {
                        dot.style.backgroundColor = '#334155'; // Dark Gray
                        dot.style.transform = 'scale(1)';
                        dot.style.boxShadow = 'none';
                    }
                }

                // Visual feedback based on gesture
                if (gestureType === 'select') {
                    // Success Selection
                    ringRef.current.style.borderColor = '#22c55e'; 
                    ringRef.current.style.transform = 'scale(0.5)';
                    ringRef.current.style.borderWidth = '4px';
                } else if (gestureType === 'rotate') {
                    // Yellow spin effect
                    ringRef.current.style.borderColor = '#eab308'; 
                    ringRef.current.style.transform = `scale(1.5) rotate(${rotationAngle}rad)`;
                    ringRef.current.style.borderStyle = 'dashed';
                } else {
                    // Default Cyan
                    ringRef.current.style.borderColor = '#06B6D4';
                    ringRef.current.style.transform = 'scale(1)';
                    ringRef.current.style.borderWidth = '2px';
                    ringRef.current.style.borderStyle = 'solid';
                }
            }
            rAF = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(rAF);
    }, []);

    return (
        <div 
            ref={cursorRef}
            className="fixed top-0 left-0 z-50 pointer-events-none -ml-5 -mt-5 transition-transform duration-75 ease-out"
        >
            <div className="relative">
                <div ref={ringRef} className="w-10 h-10 rounded-full border-2 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.8)] transition-all duration-200 flex items-center justify-center">
                    <div className="w-1 h-1 bg-white rounded-full" />
                </div>
                
                {/* Triple Click Indicators */}
                <div ref={dotsRef} className="absolute -top-4 left-1/2 -translate-x-1/2 flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-slate-700 transition-all duration-150"></div>
                    <div className="w-2 h-2 rounded-full bg-slate-700 transition-all duration-150"></div>
                    <div className="w-2 h-2 rounded-full bg-slate-700 transition-all duration-150"></div>
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
  // --- State ---
  const [selectedPlanet, setSelectedPlanet] = useState<PlanetData | null>(null);
  const [resetCameraTrigger, setResetCameraTrigger] = useState(0);
  
  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [pinchThreshold, setPinchThreshold] = useState(0.05);
  const [rotationSensitivity, setRotationSensitivity] = useState(0.05);

  // Use Ref for high-frequency hand updates to prevent react re-renders
  const handPosRef = useRef({ 
      x: 0.5, 
      y: 0.5, 
      gestureType: 'none' as 'none' | 'select' | 'rotate', 
      rotationAngle: 0,
      pinchProgress: 0
  });

  // Live Audio State
  const [isLiveActive, setIsLiveActive] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [liveSession, setLiveSession] = useState<any>(null);

  // --- Handlers ---

  // Updated callback signature
  const handleHandMove = useCallback((x: number, y: number, gestureType: 'none'|'select'|'rotate', rotationAngle: number, pinchProgress: number) => {
    handPosRef.current = { x, y, gestureType, rotationAngle, pinchProgress };
  }, []);

  const toggleLive = async () => {
    if (isLiveActive) {
      // Close session - simplified
      window.location.reload(); 
    } else {
      setIsLiveActive(true);
      try {
         // Setup Audio Contexts
         const AudioCtx = window.AudioContext || window.webkitAudioContext;
         const outputCtx = new AudioCtx({ sampleRate: 24000 });
         const inputCtx = new AudioCtx({ sampleRate: 16000 });
         audioContextRef.current = outputCtx;

         // Get Mic
         const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
         const source = inputCtx.createMediaStreamSource(stream);
         const processor = inputCtx.createScriptProcessor(4096, 1, 1);
         
         let session: any;

         const onAudioData = async (buffer: ArrayBuffer) => {
             // Play Audio
             const audioBuffer = await outputCtx.decodeAudioData(buffer);
             const sourceNode = outputCtx.createBufferSource();
             sourceNode.buffer = audioBuffer;
             sourceNode.connect(outputCtx.destination);
             sourceNode.start();
         };

         const onTranscript = (inText: string, outText: string) => {
            console.log("Live:", inText, "->", outText);
         };

         const sessionPromise = Gemini.connectLive(onAudioData, onTranscript);
         sessionPromise.then(s => {
             session = s;
             setLiveSession(s);
             
             processor.onaudioprocess = (e) => {
                 const inputData = e.inputBuffer.getChannelData(0);
                 const l = inputData.length;
                 const int16 = new Int16Array(l);
                 for (let i = 0; i < l; i++) {
                    int16[i] = inputData[i] * 32768;
                 }
                 const uint8 = new Uint8Array(int16.buffer);
                 
                 let binary = '';
                 for(let i=0; i<uint8.byteLength; i++) binary += String.fromCharCode(uint8[i]);
                 const b64 = btoa(binary);

                 s.sendRealtimeInput({
                     media: {
                         mimeType: 'audio/pcm;rate=16000',
                         data: b64
                     }
                 });
             };
             source.connect(processor);
             processor.connect(inputCtx.destination);
         });

      } catch (e) {
          console.error("Live init failed", e);
          setIsLiveActive(false);
      }
    }
  };

  return (
    <div className="relative w-full h-screen bg-black text-white overflow-hidden">
      {/* 3D Background */}
      <div className="absolute inset-0 z-0">
        <SolarSystemScene 
          selectedPlanet={selectedPlanet} 
          onSelectPlanet={setSelectedPlanet}
          handPosRef={handPosRef}
          resetTrigger={resetCameraTrigger}
          rotationSensitivity={rotationSensitivity}
        />
      </div>

      {/* Hand Tracking & Visual Cursor */}
      <HandController 
        onHandMove={handleHandMove} 
        pinchThreshold={pinchThreshold}
      />
      <CursorOverlay handPosRef={handPosRef} />

      {/* Main HUD */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6">
        {/* Header */}
        <div className="flex justify-between items-start pointer-events-auto">
           <div>
             <h1 className="text-3xl font-bold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 uppercase">
                全息空间
             </h1>
             <p className="text-xs text-cyan-300 opacity-70">Gemini 驱动 • {isLiveActive ? "实时语音已开启" : "系统在线"}</p>
           </div>
        </div>

        {/* Controls (Bottom Right) */}
        <div className="pointer-events-auto flex flex-col items-end gap-4">
            {/* Settings Panel */}
            {showSettings && (
                <div className="bg-black/80 border border-cyan-500/30 p-4 rounded-xl backdrop-blur-md w-64 animate-in fade-in slide-in-from-bottom-4 mb-2">
                    <h3 className="text-cyan-400 text-sm font-bold mb-4 border-b border-cyan-500/20 pb-2">手势灵敏度设置</h3>
                    
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-xs text-cyan-200 mb-1">
                                <span>捏合判定阈值</span>
                                <span>{Math.round(pinchThreshold * 100)}%</span>
                            </div>
                            <input 
                                type="range" 
                                min="0.02" 
                                max="0.15" 
                                step="0.01" 
                                value={pinchThreshold}
                                onChange={(e) => setPinchThreshold(parseFloat(e.target.value))}
                                className="w-full h-1 bg-cyan-900 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
                            />
                        </div>

                        <div>
                            <div className="flex justify-between text-xs text-cyan-200 mb-1">
                                <span>旋转灵敏度</span>
                                <span>{Math.round(rotationSensitivity * 100)}%</span>
                            </div>
                            <input 
                                type="range" 
                                min="0.01" 
                                max="0.20" 
                                step="0.01" 
                                value={rotationSensitivity}
                                onChange={(e) => setRotationSensitivity(parseFloat(e.target.value))}
                                className="w-full h-1 bg-cyan-900 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-400"
                            />
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-end justify-end gap-4">
                <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className={`p-4 rounded-full border transition-all shadow-lg text-cyan-400 ${showSettings ? 'bg-cyan-800/60 border-cyan-400' : 'bg-cyan-900/40 border-cyan-500 hover:bg-cyan-800/60'}`}
                    title="设置"
                >
                    <Settings />
                </button>

                <button 
                    onClick={() => setResetCameraTrigger(Date.now())}
                    className="p-4 rounded-full bg-cyan-900/40 border border-cyan-500 hover:bg-cyan-800/60 transition-all shadow-lg text-cyan-400"
                    title="重置视角"
                >
                    <RotateCcw />
                </button>

                <button 
                onClick={toggleLive}
                className={`p-4 rounded-full border-2 transition-all shadow-lg ${isLiveActive ? 'bg-red-500/20 border-red-500 animate-pulse' : 'bg-cyan-900/40 border-cyan-500 hover:bg-cyan-800/60'}`}
                title="实时语音对话"
                >
                    {isLiveActive ? <MicOff /> : <Mic />}
                </button>
            </div>
        </div>
      </div>

      {/* Planet Info Modal Overlay */}
      {selectedPlanet && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto transition-opacity animate-in fade-in duration-300">
             <div className="relative max-w-lg w-full bg-black/80 border border-cyan-500 rounded-2xl shadow-2xl shadow-cyan-900/30 p-8 overflow-hidden transform scale-100 animate-in zoom-in-95 duration-200">
                {/* Background Decorative Gradient */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/20 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2" />
                
                {/* Close Button */}
                <button
                   onClick={() => setSelectedPlanet(null)}
                   className="absolute top-4 right-4 text-cyan-500/70 hover:text-cyan-400 transition-colors rounded-full p-1 hover:bg-cyan-950/50"
                >
                   <X size={24} />
                </button>

                <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-500 mb-1">
                    {selectedPlanet.name}
                </h2>
                <div className="h-1 w-20 bg-gradient-to-r from-cyan-500 to-transparent mb-6" />

                <div className="space-y-4 text-gray-300">
                    <p className="text-lg leading-relaxed font-light">{selectedPlanet.description}</p>
                    
                    <div className="grid grid-cols-2 gap-4 py-4 border-y border-white/10">
                        <div className="flex flex-col">
                            <span className="text-xs uppercase tracking-wider text-gray-500">距离太阳</span>
                            <span className="text-xl font-mono text-cyan-400">{selectedPlanet.distance} AU</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs uppercase tracking-wider text-gray-500">相对大小</span>
                            <span className="text-xl font-mono text-cyan-400">{selectedPlanet.size}x 地球</span>
                        </div>
                    </div>
                    
                    {/* Planet Facts Section */}
                    <div className="mt-4 pt-2">
                        <h3 className="text-sm font-bold text-purple-300 flex items-center gap-2 mb-3">
                            <Sparkles size={16} /> 星球档案
                        </h3>
                        <div className="bg-purple-900/10 border border-purple-500/20 rounded-xl p-4 min-h-[100px]">
                            <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">
                                {selectedPlanet.scienceFacts}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;