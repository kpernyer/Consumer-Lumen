import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { Article, ConsumerProfile } from '../types';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../services/audioUtils';
import { Mic, MicOff, Phone, Activity } from 'lucide-react';

interface LiveSessionProps {
  article: Article;
  profile: ConsumerProfile;
  onClose: () => void;
}

const LiveSession: React.FC<LiveSessionProps> = ({ article, profile, onClose }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState<string>('Initializing...');
  const [volume, setVolume] = useState(0);

  // Audio Context Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null); // To store session object if needed, mostly used via closure in effect

  // Visualizer Ref
  const animationFrameRef = useRef<number>();

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close(); 
    }
    if (inputAudioContextRef.current) {
      inputAudioContextRef.current.close();
    }
    if (outputAudioContextRef.current) {
      outputAudioContextRef.current.close();
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setIsConnected(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    let mounted = true;

    const startSession = async () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // Setup Audio Contexts
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const outputNode = outputAudioContextRef.current!.createGain();
        outputNode.connect(outputAudioContextRef.current!.destination);

        // Get Microphone Stream
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Connect Live API
        const sessionPromise = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          callbacks: {
            onopen: () => {
              if (!mounted) return;
              setIsConnected(true);
              setStatus('Connected. Say "Hello" to start.');
              
              // Setup Audio Input Processing
              const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
              const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
              
              scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                if (isMuted) return; // Simple mute implementation
                
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                
                // Simple volume meter for UI
                let sum = 0;
                for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
                const rms = Math.sqrt(sum / inputData.length);
                setVolume(Math.min(rms * 5, 1)); // Scale for UI

                const pcmBlob = createPcmBlob(inputData);
                sessionPromise.then((session) => {
                  session.sendRealtimeInput({ media: pcmBlob });
                });
              };

              source.connect(scriptProcessor);
              scriptProcessor.connect(inputAudioContextRef.current!.destination);
            },
            onmessage: async (message: LiveServerMessage) => {
              if (!mounted) return;
              
              // Handle Audio Output
              const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (base64Audio && outputAudioContextRef.current) {
                 const ctx = outputAudioContextRef.current;
                 nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                 
                 const audioBuffer = await decodeAudioData(
                   base64ToUint8Array(base64Audio),
                   ctx,
                   24000,
                   1
                 );
                 
                 const source = ctx.createBufferSource();
                 source.buffer = audioBuffer;
                 source.connect(outputNode);
                 source.addEventListener('ended', () => {
                    sourcesRef.current.delete(source);
                 });
                 source.start(nextStartTimeRef.current);
                 nextStartTimeRef.current += audioBuffer.duration;
                 sourcesRef.current.add(source);
              }

              // Handle Interruption
              if (message.serverContent?.interrupted) {
                sourcesRef.current.forEach(src => src.stop());
                sourcesRef.current.clear();
                nextStartTimeRef.current = 0;
              }
            },
            onclose: () => {
              if(mounted) setStatus('Disconnected');
            },
            onerror: (err) => {
              console.error(err);
              if(mounted) setStatus('Error occurred');
            }
          },
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
            systemInstruction: `
              You are a podcast host answering a live listener call. 
              The listener is: ${profile.role}, ${profile.expertise}.
              The topic of discussion is the article: "${article.title}".
              Content of the article: ${article.content.substring(0, 5000)}... (truncated if too long).
              
              Your goal is to answer their questions, debate the points, and provide insights based strictly on the article content provided.
              Be conversational, engaging, and smart.
            `,
          },
        });
        
        // Store session for cleanup
        sessionPromise.then(sess => {
            sessionRef.current = sess;
        });

      } catch (e) {
        console.error("Failed to start live session", e);
        setStatus("Failed to connect microphone or API.");
      }
    };

    startSession();

    return () => {
      mounted = false;
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-700">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-6 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="relative">
               <div className={`absolute inset-0 bg-white rounded-full animate-ping opacity-75 ${isConnected ? 'block' : 'hidden'}`}></div>
               <Activity className="relative z-10 w-6 h-6" />
             </div>
             <div>
               <h3 className="font-bold text-lg">Live Knowledge Pod</h3>
               <p className="text-xs opacity-80 uppercase tracking-wider">On Air</p>
             </div>
          </div>
          <div className="bg-white/20 px-3 py-1 rounded-full text-xs font-medium">
             {status}
          </div>
        </div>

        {/* Visualizer Area */}
        <div className="h-64 flex flex-col items-center justify-center bg-slate-900 relative">
          {/* Animated rings based on volume */}
          <div 
             className="absolute rounded-full bg-indigo-500/30 transition-all duration-75 ease-out"
             style={{ width: `${100 + volume * 200}px`, height: `${100 + volume * 200}px` }}
          />
          <div 
             className="absolute rounded-full bg-violet-500/50 transition-all duration-75 ease-out"
             style={{ width: `${80 + volume * 150}px`, height: `${80 + volume * 150}px` }}
          />
           <div 
             className="absolute rounded-full bg-white transition-all duration-75 ease-out shadow-[0_0_30px_rgba(255,255,255,0.5)]"
             style={{ width: `${60 + volume * 50}px`, height: `${60 + volume * 50}px` }}
          />
        </div>

        {/* Info Area */}
        <div className="p-6 bg-slate-50 dark:bg-slate-800">
           <h4 className="text-sm font-semibold text-slate-500 mb-2 uppercase">Currently Discussing</h4>
           <p className="font-medium text-slate-900 dark:text-white line-clamp-2">{article.title}</p>
        </div>

        {/* Controls */}
        <div className="p-6 flex justify-center items-center gap-6 border-t border-slate-200 dark:border-slate-700">
           <button 
             onClick={() => setIsMuted(!isMuted)}
             className={`p-4 rounded-full transition-colors ${isMuted ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
           >
             {isMuted ? <MicOff className="w-6 h-6"/> : <Mic className="w-6 h-6"/>}
           </button>
           
           <button 
             onClick={disconnect}
             className="bg-red-500 hover:bg-red-600 text-white p-4 rounded-full shadow-lg transform hover:scale-105 transition-all"
           >
             <Phone className="w-8 h-8 rotate-135" />
           </button>
        </div>
      </div>
    </div>
  );
};

export default LiveSession;