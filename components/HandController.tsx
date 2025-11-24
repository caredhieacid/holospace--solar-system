import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { MousePointer2 } from 'lucide-react';

interface HandControllerProps {
    onHandMove: (
        x: number, 
        y: number, 
        gestureType: 'none' | 'select' | 'rotate',
        rotationAngle: number,
        pinchProgress: number // 0, 1, 2, 3 (triggered)
    ) => void;
    pinchThreshold?: number;
}

const CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8], // Index
    [0, 9], [9, 10], [10, 11], [11, 12], // Middle
    [0, 13], [13, 14], [14, 15], [15, 16], // Ring
    [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
    [5, 9], [9, 13], [13, 17] // Palm
];

const HandController: React.FC<HandControllerProps> = ({ onHandMove, pinchThreshold = 0.05 }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [loaded, setLoaded] = useState(false);
    
    // Refs for Loop
    const onHandMoveRef = useRef(onHandMove);
    const pinchThresholdRef = useRef(pinchThreshold);
    
    // Triple Pinch State Machine
    const pinchStateRef = useRef({
        count: 0,
        lastPinchTime: 0,
        isPinching: false,
        triggerTime: 0
    });

    useEffect(() => {
        onHandMoveRef.current = onHandMove;
    }, [onHandMove]);

    useEffect(() => {
        pinchThresholdRef.current = pinchThreshold;
    }, [pinchThreshold]);

    useEffect(() => {
        let handLandmarker: HandLandmarker | null = null;
        let animationFrameId: number;

        const setup = async () => {
            try {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
                );
                handLandmarker = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numHands: 2
                });
                setLoaded(true);
                startWebcam();
            } catch (e) {
                console.error("MediaPipe Load Error:", e);
            }
        };

        const startWebcam = async () => {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && videoRef.current) {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                videoRef.current.srcObject = stream;
                videoRef.current.addEventListener("loadeddata", predictWebcam);
            }
        };

        let lastVideoTime = -1;
        const predictWebcam = () => {
            if (videoRef.current && handLandmarker && canvasRef.current) {
                const video = videoRef.current;
                const canvas = canvasRef.current;
                const ctx = canvas.getContext('2d');

                if (video.currentTime !== lastVideoTime) {
                    lastVideoTime = video.currentTime;
                    const results = handLandmarker.detectForVideo(video, performance.now());
                    
                    // Clear canvas
                    ctx?.clearRect(0, 0, canvas.width, canvas.height);

                    if (results.landmarks && results.landmarks.length > 0) {
                        
                        // Process the primary hand (first detected)
                        const landmarks = results.landmarks[0];
                        
                        // --- GESTURE LOGIC ---
                        
                        const wrist = landmarks[0];
                        const thumbTip = landmarks[4];
                        const indexTip = landmarks[8];
                        const indexPip = landmarks[6]; 
                        const middleTip = landmarks[12];
                        const middlePip = landmarks[10];
                        const ringTip = landmarks[16];
                        const ringPip = landmarks[14];
                        const pinkyTip = landmarks[20];
                        const pinkyPip = landmarks[18];

                        const dist = (p1: NormalizedLandmark, p2: NormalizedLandmark) => 
                            Math.hypot(p1.x - p2.x, p1.y - p2.y);

                        // 1. Feature Detection
                        
                        // Index Extended: Tip further than PIP from wrist
                        const isIndexExtended = dist(wrist, indexTip) > dist(wrist, indexPip) * 1.2;
                        
                        // Curled Checks (Tip closer to wrist than PIP)
                        const isMiddleCurled = dist(wrist, middleTip) < dist(wrist, middlePip);
                        const isRingCurled = dist(wrist, ringTip) < dist(wrist, ringPip);
                        const isPinkyCurled = dist(wrist, pinkyTip) < dist(wrist, pinkyPip);

                        // Rotate Mode (Number 1 Sign): Index Up, Middle/Ring/Pinky DOWN
                        const isRotateMode = isIndexExtended && isMiddleCurled && isRingCurled && isPinkyCurled;

                        // Pinch Check (Thumb + Middle)
                        const pinchDistance = dist(thumbTip, middleTip);
                        const isPinchCandidate = pinchDistance < pinchThresholdRef.current;

                        // Valid Selection Pinch:
                        // 1. Distance is small
                        // 2. CRITICAL: Middle Finger must NOT be curled (prevents false positive in Fist/Rotate mode)
                        const isValidPinch = isPinchCandidate && !isMiddleCurled;

                        // --- Triple Click State Machine ---
                        const now = performance.now();
                        const pState = pinchStateRef.current;

                        // Rising Edge Detection
                        if (isValidPinch && !pState.isPinching) {
                            // Check time window (500ms)
                            if (now - pState.lastPinchTime < 500) {
                                pState.count++;
                            } else {
                                pState.count = 1; // Reset if too slow
                            }
                            pState.lastPinchTime = now;
                            pState.isPinching = true;
                        } else if (!isValidPinch) {
                            pState.isPinching = false;
                        }

                        // Auto-reset count if user stops pinching for too long
                        if (!pState.isPinching && (now - pState.lastPinchTime > 600) && pState.count > 0) {
                            pState.count = 0;
                        }

                        // Trigger logic
                        let gestureType: 'none' | 'select' | 'rotate' = 'none';
                        let pinchProgress = pState.count; // 0, 1, 2, 3

                        if (isRotateMode) {
                            gestureType = 'rotate';
                            // Reset selection state if rotating
                            pState.count = 0; 
                            pinchProgress = 0;
                        } else if (pState.count >= 3) {
                            gestureType = 'select';
                            // Reset after trigger
                            pState.count = 0;
                            pinchProgress = 3; // Transient state for UI
                        }

                        // 2. Calculate Hand Rotation (Roll)
                        const p0 = wrist;
                        const p5 = landmarks[5]; 
                        const dx = p5.x - p0.x;
                        const dy = p5.y - p0.y; 
                        const angle = Math.atan2(dy, dx); 
                        const rotationAngle = angle + (Math.PI / 2);

                        // --- DRAWING ---
                        if (ctx) {
                            ctx.lineWidth = 2;
                            let strokeColor = '#00FFFF'; // Cyan
                            if (gestureType === 'select') strokeColor = '#00FF00'; // Green
                            if (gestureType === 'rotate') strokeColor = '#FFFF00'; // Yellow
                            if (isValidPinch && gestureType === 'none') strokeColor = '#FFFFFF'; // White (Click in progress)

                            ctx.strokeStyle = strokeColor;
                            ctx.fillStyle = strokeColor;

                            // Connections
                            CONNECTIONS.forEach(([start, end]) => {
                                const p1 = landmarks[start];
                                const p2 = landmarks[end];
                                ctx.beginPath();
                                ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
                                ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
                                ctx.stroke();
                            });

                            // Points
                            landmarks.forEach(p => {
                                ctx.beginPath();
                                ctx.arc(p.x * canvas.width, p.y * canvas.height, 3, 0, 2 * Math.PI);
                                ctx.fill();
                            });

                            // Visuals
                            if (isValidPinch) {
                                ctx.beginPath();
                                ctx.moveTo(thumbTip.x * canvas.width, thumbTip.y * canvas.height);
                                ctx.lineTo(middleTip.x * canvas.width, middleTip.y * canvas.height);
                                ctx.lineWidth = 4;
                                ctx.strokeStyle = pinchProgress > 0 ? '#00FF00' : '#FFFFFF';
                                ctx.stroke();
                            }

                            if (gestureType === 'rotate') {
                                const cx = indexTip.x * canvas.width;
                                const cy = indexTip.y * canvas.height;
                                ctx.beginPath();
                                ctx.arc(cx, cy, 20, 0, 2 * Math.PI);
                                ctx.strokeStyle = '#FFFF00';
                                ctx.setLineDash([5, 5]);
                                ctx.stroke();
                                ctx.setLineDash([]);
                            }
                        }

                        const cursorX = 1 - indexTip.x;
                        const cursorY = indexTip.y;

                        onHandMoveRef.current(cursorX, cursorY, gestureType, rotationAngle, pinchProgress);
                    }
                }
            }
            animationFrameId = requestAnimationFrame(predictWebcam);
        };

        setup();

        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (videoRef.current?.srcObject) {
                 (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
            }
            if (handLandmarker) handLandmarker.close();
        };
    }, []);

    return (
        <div className="fixed top-4 right-4 z-50 flex flex-col items-end gap-3 pointer-events-none">
            {/* Gesture Guide UI */}
            <div className="bg-black/80 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-5 text-xs text-cyan-100 shadow-[0_0_30px_rgba(6,182,212,0.2)] w-64 animate-fade-in transition-all duration-500">
                <h4 className="font-bold text-cyan-400 mb-4 border-b border-cyan-500/30 pb-2 flex items-center gap-2 tracking-wider">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_cyan]" />
                    全息手势指南 V2.1
                </h4>
                <div className="space-y-4">
                    <div className="flex items-center gap-3 group">
                        <div className="w-10 h-10 flex items-center justify-center bg-cyan-900/40 rounded-full text-xl border border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]">
                            <MousePointer2 size={18} />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-bold text-cyan-200">光标移动</span>
                            <span className="text-cyan-400/60 text-[10px]">食指指尖控制</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3 group">
                        <div className="w-10 h-10 flex items-center justify-center bg-green-900/40 rounded-full text-xl border border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]">
                            👌
                        </div>
                        <div className="flex flex-col">
                            <span className="font-bold text-green-200">确认选择</span>
                            <span className="text-green-400/60 text-[10px]">拇指+中指 <b className="text-white">连续捏合3次</b></span>
                            <span className="text-red-400/60 text-[9px]">(请确保中指伸出，勿握拳)</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 group">
                        <div className="w-10 h-10 flex items-center justify-center bg-yellow-900/40 rounded-full text-xl border border-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.1)]">
                            ☝️
                        </div>
                        <div className="flex flex-col">
                            <span className="font-bold text-yellow-200">旋转宇宙</span>
                            <span className="text-yellow-400/60 text-[10px]">竖起食指(握拳)并左右倾斜</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Video Feed */}
            <div className="relative w-80 h-60 bg-black/60 border border-cyan-500/50 rounded-xl overflow-hidden backdrop-blur-sm shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                {!loaded && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-cyan-500 bg-black/80 z-10">
                        <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-xs animate-pulse">正在初始化视觉引擎...</span>
                    </div>
                )}
                <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-screen"
                    style={{ transform: 'scaleX(-1)' }} 
                />
                <canvas 
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                    width={320}
                    height={240}
                />
                <div className="absolute bottom-2 right-2 text-[10px] text-cyan-500/50 font-mono">SENSOR ACTIVE</div>
            </div>
        </div>
    );
};

export default HandController;