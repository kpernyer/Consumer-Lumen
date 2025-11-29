import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Article, ConsumerProfile, ConsumerFormat, Podcast, Adaptation } from '../types';
import { adaptContent, generatePodcastAudio, adaptToComic, generateComicIllustration } from '../services/gemini';
import { Play, FileText, Mic2, BookOpen, Clock, Users, Headphones, Image as ImageIcon, Download, ChevronRight, FileAudio, RotateCcw, Palette, XCircle, CheckCircle, Info } from 'lucide-react';
import LiveSession from './LiveSession';
import { base64ToUint8Array, decodeAudioData, arrayBufferToBase64, audioBufferToWav } from '../services/audioUtils';

// -- Simple Markdown & Script Renderer --
const SimpleMarkdown = ({ text }: { text: string }) => {
  if (!text) return null;
  
  const lines = text.split('\n');
  
  const formatInline = (str: string) => {
    // Basic bold **text** handling
    const parts = str.split(/(\*\*.*?\*\*)/);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
        }
        return part;
    });
  };

  return (
    <div className="space-y-3 font-sans text-slate-700">
      {lines.map((line, idx) => {
        const key = idx;
        // Headers
        if (line.startsWith('### ')) return <h3 key={key} className="text-lg font-bold text-indigo-900 mt-4 mb-2">{formatInline(line.slice(4))}</h3>;
        if (line.startsWith('## ')) return <h2 key={key} className="text-xl font-bold text-indigo-900 mt-6 mb-3 pb-1 border-b border-indigo-100">{formatInline(line.slice(3))}</h2>;
        if (line.startsWith('# ')) return <h1 key={key} className="text-2xl font-extrabold text-indigo-900 mt-6 mb-4">{formatInline(line.slice(2))}</h1>;
        
        // Lists
        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
             return (
               <div key={key} className="flex gap-2 ml-2">
                 <span className="text-indigo-400 font-bold">•</span>
                 <span>{formatInline(line.replace(/^[\-\*]\s/, ''))}</span>
               </div>
             );
        }
        
        // Comic Script Specifics
        if (line.toLowerCase().startsWith('**panel')) {
             return <div key={key} className="mt-8 mb-2 font-bold text-indigo-700 bg-indigo-50 inline-block px-3 py-1 rounded-full text-xs uppercase tracking-wide border border-indigo-100">{formatInline(line.replace(/\*\*/g, ''))}</div>;
        }
        
        // Character dialogue (e.g., *Tintin:* ...)
        if (/^\*[A-Za-z]+:\*/.test(line) || /^\*[A-Za-z]+\s[A-Za-z]+:\*/.test(line)) {
            const split = line.indexOf(':*');
            if (split > -1) {
                const speaker = line.slice(1, split);
                const content = line.slice(split + 2).trim();
                return (
                    <div key={key} className="mb-3 pl-4 border-l-4 border-slate-200">
                        <span className="font-bold text-slate-900 uppercase text-xs tracking-wider block mb-1">{speaker}</span>
                        <span className="text-slate-800 text-lg">{formatInline(content)}</span>
                    </div>
                );
            }
        }

        // Scene descriptions / Visuals (often *Visual: ...*)
        if (line.includes('*Visual:*') || line.includes('*Caption:*')) {
             return <p key={key} className="text-sm text-slate-500 italic bg-slate-50 p-3 rounded-md border border-slate-100 mb-2">{formatInline(line.replace(/\*/g, ''))}</p>;
        }

        if (line.trim() === '') return <div key={key} className="h-2"></div>;
        
        return <p key={key} className="leading-relaxed">{formatInline(line)}</p>;
      })}
    </div>
  );
};

interface ConsumerDashboardProps {
  articles: Article[];
  setArticles: React.Dispatch<React.SetStateAction<Article[]>>;
}

interface Notification {
  message: string;
  type: 'success' | 'error' | 'info';
}

const ConsumerDashboard: React.FC<ConsumerDashboardProps> = ({ articles, setArticles }) => {
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ConsumerProfile>({
    role: 'Marketing Manager',
    expertise: 'Novice',
    timeConstraint: '5 minutes'
  });
  const [activeFormat, setActiveFormat] = useState<ConsumerFormat>(ConsumerFormat.TEXT_SUMMARY);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<string>('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [showLiveSession, setShowLiveSession] = useState(false);
  
  // Notification State
  const [notification, setNotification] = useState<Notification | null>(null);
  
  // Refs for audio playback
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type });
  };

  const selectedArticle = useMemo(
    () => articles.find(a => a.id === selectedArticleId),
    [articles, selectedArticleId]
  );

  const getProfileKey = () => `${profile.role} - ${profile.expertise}`;

  const storedAdaptation = useMemo(() => {
    if (!selectedArticle) return null;
    const key = getProfileKey();
    if (activeFormat === ConsumerFormat.COMIC_BOOK) {
         return selectedArticle.adaptations.find(a => a.profileDescription === 'Tintin Comic Script');
    }
    return selectedArticle.adaptations.find(a => a.profileDescription === key);
  }, [selectedArticle, profile, activeFormat]);

  const storedPodcast = useMemo(() => {
    if (!selectedArticle) return null;
    const key = getProfileKey();
    return selectedArticle.podcasts.find(p => p.profileDescription === key);
  }, [selectedArticle, profile]);

  const handleArticleSelect = (id: string) => {
    setSelectedArticleId(id);
    setGeneratedContent('');
    setGeneratedImage(null);
    setAudioUrl(null);
    stopAudio();
    setActiveFormat(ConsumerFormat.TEXT_SUMMARY);
  };

  const handleGenerate = async () => {
    if (!selectedArticle) return;
    setIsGenerating(true);
    setGeneratedContent('');
    setGeneratedImage(null);
    stopAudio();

    try {
      if (activeFormat === ConsumerFormat.PODCAST_STATIC) {
        if (storedPodcast) {
           playStoredPodcast(storedPodcast.audioBase64);
           showNotification("Playing stored podcast", "success");
        } else {
           showNotification("Generating AI Podcast. This may take a moment...", "info");
           const buffer = await generatePodcastAudio(selectedArticle, profile);
           if (buffer) {
             const base64 = arrayBufferToBase64(buffer.getChannelData(0).buffer); 
             const wavBlob = audioBufferToWav(buffer);
             const reader = new FileReader();
             reader.readAsDataURL(wavBlob);
             reader.onloadend = () => {
                const base64Wav = (reader.result as string).split(',')[1];
                const newPodcast: Podcast = {
                    id: crypto.randomUUID(),
                    profileDescription: getProfileKey(),
                    audioBase64: base64Wav,
                    createdAt: new Date().toISOString()
                };
                const updatedArticle = {
                    ...selectedArticle,
                    podcasts: [newPodcast, ...selectedArticle.podcasts]
                };
                setArticles(prev => prev.map(a => a.id === updatedArticle.id ? updatedArticle : a));
                playStoredPodcast(base64Wav);
                showNotification("Podcast generated and saved", "success");
             };
           } else {
             showNotification("Generation failed. Please try again.", "error");
           }
        }
      } else if (activeFormat === ConsumerFormat.COMIC_BOOK) {
         showNotification("Generating Comic Script...", "info");
         const comicScript = await adaptToComic(selectedArticle);
         setGeneratedContent(comicScript);
         
         const newAdaptation: Adaptation = {
             id: crypto.randomUUID(),
             profileDescription: 'Tintin Comic Script',
             content: comicScript,
             createdAt: new Date().toISOString()
         };
         
         const updatedArticle = {
             ...selectedArticle,
             adaptations: [newAdaptation, ...selectedArticle.adaptations]
         };
         setArticles(prev => prev.map(a => a.id === updatedArticle.id ? updatedArticle : a));
         showNotification("Comic script created", "success");

      } else {
        showNotification("Adapting content...", "info");
        const text = await adaptContent(selectedArticle, profile);
        setGeneratedContent(text);

        const newAdaptation: Adaptation = {
            id: crypto.randomUUID(),
            profileDescription: getProfileKey(),
            content: text,
            createdAt: new Date().toISOString()
        };

        const updatedArticle = {
            ...selectedArticle,
            adaptations: [newAdaptation, ...selectedArticle.adaptations]
        };
        setArticles(prev => prev.map(a => a.id === updatedArticle.id ? updatedArticle : a));
        showNotification("Adaptation complete", "success");
      }
    } catch (error) {
      console.error("Generation failed", error);
      showNotification("Error: Server overloaded or content too long.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleIllustrate = async () => {
    if (!generatedContent || !selectedArticle) return;
    setIsGeneratingImage(true);
    showNotification("Creating illustration...", "info");
    
    try {
      const imageBase64 = await generateComicIllustration(generatedContent);
      if (imageBase64) {
        setGeneratedImage(imageBase64);
        
        const adaptationKey = 'Tintin Comic Script';
        const existingAdaptationIndex = selectedArticle.adaptations.findIndex(a => a.profileDescription === adaptationKey);
        
        if (existingAdaptationIndex >= 0) {
            const updatedAdaptations = [...selectedArticle.adaptations];
            updatedAdaptations[existingAdaptationIndex] = {
                ...updatedAdaptations[existingAdaptationIndex],
                image: imageBase64
            };
            
            const updatedArticle = {
                ...selectedArticle,
                adaptations: updatedAdaptations
            };
            setArticles(prev => prev.map(a => a.id === updatedArticle.id ? updatedArticle : a));
        }
        showNotification("Illustration created successfully", "success");
      } else {
          showNotification("Failed to create illustration", "error");
      }
    } catch (e) {
      console.error("Illustration failed", e);
      showNotification("Error creating illustration", "error");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const playStoredPodcast = async (base64: string) => {
      stopAudio();
      try {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const buffer = await audioContextRef.current.decodeAudioData(bytes.buffer);
        
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => setIsPlaying(false);
        source.start(0);
        
        sourceNodeRef.current = source;
        setIsPlaying(true);
      } catch (e) {
          console.error("Playback error", e);
          showNotification("Error playing audio", "error");
      }
  };

  const stopAudio = () => {
      if (sourceNodeRef.current) {
          sourceNodeRef.current.stop();
          sourceNodeRef.current = null;
      }
      setIsPlaying(false);
  };

  const loadAdaptation = (adaptation: Adaptation) => {
      setGeneratedContent(adaptation.content);
      setGeneratedImage(adaptation.image || null);
      
      if (adaptation.profileDescription === 'Tintin Comic Script') {
          setActiveFormat(ConsumerFormat.COMIC_BOOK);
      } else {
          setActiveFormat(ConsumerFormat.FULL_ADAPTIVE); 
      }
      showNotification("Loaded saved version", "info");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full relative">
      
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-24 right-6 z-50 px-6 py-4 rounded-xl shadow-2xl border flex items-center gap-3 animate-in slide-in-from-top-5 fade-in duration-300 ${
          notification.type === 'success' ? 'bg-white border-green-200 text-green-800' :
          notification.type === 'error' ? 'bg-white border-red-200 text-red-800' :
          'bg-slate-900 border-slate-700 text-white'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-5 h-5" /> : 
           notification.type === 'error' ? <XCircle className="w-5 h-5" /> : 
           <Info className="w-5 h-5" />}
          <span className="font-medium text-sm">{notification.message}</span>
        </div>
      )}

      {/* Sidebar List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 lg:col-span-1 flex flex-col h-[calc(100vh-140px)]">
        <h2 className="text-lg font-bold text-slate-800 mb-4 px-2">Knowledge Base</h2>
        <div className="space-y-2 overflow-y-auto flex-1 pr-2">
          {articles.map(art => (
            <button
              key={art.id}
              onClick={() => handleArticleSelect(art.id)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                selectedArticleId === art.id 
                  ? 'bg-indigo-50 border-indigo-200 shadow-sm' 
                  : 'bg-white border-slate-100 hover:border-indigo-100 hover:bg-slate-50'
              }`}
            >
              <div className="flex justify-between items-start">
                 <h3 className={`font-medium text-sm ${selectedArticleId === art.id ? 'text-indigo-900' : 'text-slate-700'}`}>{art.title}</h3>
                 <div className="flex gap-1">
                    {art.podcasts.length > 0 && <Headphones className="w-3 h-3 text-indigo-400" />}
                    {art.adaptations.length > 0 && <FileText className="w-3 h-3 text-emerald-400" />}
                 </div>
              </div>
              <p className="text-xs text-slate-400 mt-1 line-clamp-1">{art.author}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 lg:col-span-2 flex flex-col h-[calc(100vh-140px)] overflow-hidden">
        {!selectedArticle ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <BookOpen className="w-16 h-16 mb-4 opacity-20" />
            <p>Select an article to start learning</p>
          </div>
        ) : (
          <>
            {/* Header / Profile Config */}
            <div className="mb-6 pb-6 border-b border-slate-100">
              <h1 className="text-2xl font-bold text-slate-900 mb-4">{selectedArticle.title}</h1>
              
              <div className="flex flex-wrap gap-4 items-center bg-slate-50 p-4 rounded-lg border border-slate-100">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-slate-500" />
                  <select 
                    value={profile.role}
                    onChange={(e) => setProfile({...profile, role: e.target.value})}
                    className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 cursor-pointer"
                  >
                    <option>Marketing Manager</option>
                    <option>Software Engineer</option>
                    <option>Executive</option>
                    <option>Student</option>
                  </select>
                </div>
                <div className="w-px h-4 bg-slate-300"></div>
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-slate-500" />
                  <select 
                    value={profile.expertise}
                    onChange={(e) => setProfile({...profile, expertise: e.target.value})}
                    className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 cursor-pointer"
                  >
                    <option>Novice</option>
                    <option>Intermediate</option>
                    <option>Expert</option>
                  </select>
                </div>
                <div className="w-px h-4 bg-slate-300"></div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <select 
                    value={profile.timeConstraint}
                    onChange={(e) => setProfile({...profile, timeConstraint: e.target.value})}
                    className="bg-transparent border-none text-sm font-medium text-slate-700 focus:ring-0 cursor-pointer"
                  >
                    <option>2 minutes</option>
                    <option>5 minutes</option>
                    <option>15 minutes</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              <button 
                onClick={() => setActiveFormat(ConsumerFormat.TEXT_SUMMARY)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeFormat === ConsumerFormat.TEXT_SUMMARY || activeFormat === ConsumerFormat.FULL_ADAPTIVE ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <FileText className="w-4 h-4" /> Text Adapt
              </button>
              <button 
                onClick={() => setActiveFormat(ConsumerFormat.PODCAST_STATIC)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeFormat === ConsumerFormat.PODCAST_STATIC ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <Headphones className="w-4 h-4" /> AI Podcast
              </button>
              <button 
                onClick={() => setActiveFormat(ConsumerFormat.COMIC_BOOK)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeFormat === ConsumerFormat.COMIC_BOOK ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <ImageIcon className="w-4 h-4" /> Tintin Comic
              </button>
              <button 
                onClick={() => setShowLiveSession(true)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors bg-gradient-to-r from-red-500 to-pink-500 text-white shadow-md hover:shadow-lg`}
              >
                <Mic2 className="w-4 h-4" /> Live Pod
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto bg-slate-50 rounded-lg p-6 border border-slate-100 relative">
              
              {/* --- TEXT & COMIC VIEW --- */}
              {(activeFormat === ConsumerFormat.TEXT_SUMMARY || activeFormat === ConsumerFormat.FULL_ADAPTIVE || activeFormat === ConsumerFormat.COMIC_BOOK) && (
                <div>
                   {/* If we have a stored adaptation for this specific view (Comic vs Text), show it */}
                   {storedAdaptation && !generatedContent ? (
                       <div className="max-w-none">
                            <div className="bg-indigo-50 border border-indigo-100 text-indigo-800 px-4 py-2 rounded-lg mb-4 text-sm flex items-center justify-between">
                               <span>Loaded saved version: <strong>{storedAdaptation.profileDescription}</strong></span>
                               <span className="text-xs opacity-70">{new Date(storedAdaptation.createdAt).toLocaleDateString()}</span>
                            </div>
                           
                           {/* Illustration Display for Stored Comic */}
                           {storedAdaptation.image && activeFormat === ConsumerFormat.COMIC_BOOK && (
                             <div className="mb-8 rounded-xl overflow-hidden shadow-lg border-4 border-white">
                               <img src={`data:image/png;base64,${storedAdaptation.image}`} alt="Comic Illustration" className="w-full h-auto" />
                             </div>
                           )}

                           <SimpleMarkdown text={storedAdaptation.content} />

                           {/* Button to illustrate if missing */}
                           {activeFormat === ConsumerFormat.COMIC_BOOK && !storedAdaptation.image && (
                              <button 
                                onClick={() => {
                                    setGeneratedContent(storedAdaptation.content);
                                    handleIllustrate();
                                }}
                                disabled={isGeneratingImage}
                                className="mt-8 flex items-center gap-2 px-4 py-2 bg-pink-100 text-pink-700 rounded-lg hover:bg-pink-200 font-medium transition-colors w-full justify-center"
                              >
                                {isGeneratingImage ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Palette className="w-4 h-4" />}
                                {isGeneratingImage ? 'Illustrating...' : 'Send to Nano Banana (Illustrate)'}
                              </button>
                           )}

                       </div>
                   ) : generatedContent ? (
                       <div className="max-w-none">
                           {/* Illustration Display for Fresh Content */}
                           {generatedImage && activeFormat === ConsumerFormat.COMIC_BOOK && (
                             <div className="mb-8 rounded-xl overflow-hidden shadow-lg border-4 border-white">
                               <img src={`data:image/png;base64,${generatedImage}`} alt="Comic Illustration" className="w-full h-auto" />
                             </div>
                           )}

                           <SimpleMarkdown text={generatedContent} />
                           
                           {activeFormat === ConsumerFormat.COMIC_BOOK && !generatedImage && (
                             <button 
                                onClick={handleIllustrate}
                                disabled={isGeneratingImage}
                                className="mt-8 flex items-center gap-2 px-4 py-2 bg-pink-100 text-pink-700 rounded-lg hover:bg-pink-200 font-medium transition-colors w-full justify-center"
                              >
                                {isGeneratingImage ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Palette className="w-4 h-4" />}
                                {isGeneratingImage ? 'Illustrating...' : 'Send to Nano Banana (Illustrate)'}
                              </button>
                           )}
                       </div>
                   ) : (
                       <div className="text-center py-12">
                           <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                               {activeFormat === ConsumerFormat.COMIC_BOOK ? <ImageIcon className="w-8 h-8 text-indigo-400" /> : <FileText className="w-8 h-8 text-indigo-400" />}
                           </div>
                           <h3 className="text-lg font-medium text-slate-900 mb-2">
                               {activeFormat === ConsumerFormat.COMIC_BOOK ? "Generate Comic Script" : "Adapt Content"}
                           </h3>
                           <p className="text-slate-500 max-w-md mx-auto mb-6">
                               {activeFormat === ConsumerFormat.COMIC_BOOK 
                                 ? "Create a Tintin-style graphic novel script based on this article." 
                                 : `Adapt this article for a ${profile.expertise} ${profile.role} with ${profile.timeConstraint} to read.`}
                           </p>
                           <button 
                             onClick={handleGenerate} 
                             disabled={isGenerating}
                             className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
                           >
                             {isGenerating ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                             {isGenerating ? 'Generating...' : 'Generate Now'}
                           </button>
                       </div>
                   )}
                </div>
              )}

              {/* --- PODCAST VIEW --- */}
              {activeFormat === ConsumerFormat.PODCAST_STATIC && (
                <div className="flex flex-col items-center justify-center h-full">
                   {storedPodcast ? (
                      <div className="text-center w-full max-w-md">
                          <div className="w-32 h-32 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-200">
                             <Headphones className="w-16 h-16 text-white" />
                          </div>
                          <h3 className="text-xl font-bold text-slate-900 mb-2">Podcast Ready</h3>
                          <p className="text-slate-500 mb-8">Generated for {storedPodcast.profileDescription}</p>
                          
                          <button 
                            onClick={() => isPlaying ? stopAudio() : playStoredPodcast(storedPodcast.audioBase64)}
                            className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 font-bold text-lg transition-all ${isPlaying ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg hover:shadow-indigo-300'}`}
                          >
                             {isPlaying ? <div className="w-3 h-3 bg-red-500 rounded-sm animate-pulse" /> : <Play className="w-6 h-6 fill-current" />}
                             {isPlaying ? 'Stop Playing' : 'Play Episode'}
                          </button>
                      </div>
                   ) : (
                      <div className="text-center">
                          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                             <Mic2 className="w-8 h-8 text-indigo-400" />
                          </div>
                          <h3 className="text-lg font-medium text-slate-900 mb-2">Generate Podcast</h3>
                          <p className="text-slate-500 max-w-md mx-auto mb-6">
                              Create a 2-person dialogue analyzing this article for a {profile.expertise} audience.
                          </p>
                          <button 
                             onClick={handleGenerate} 
                             disabled={isGenerating}
                             className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50 flex items-center gap-2 mx-auto"
                           >
                             {isGenerating ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                             {isGenerating ? 'Producing Audio...' : 'Generate Podcast'}
                           </button>
                      </div>
                   )}
                </div>
              )}
            </div>

            {/* Saved Assets Footer (Always Visible) */}
            {(selectedArticle.podcasts.length > 0 || selectedArticle.adaptations.length > 0) && (
              <div className="mt-6 border-t border-slate-100 pt-4">
                 <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Saved Files & Adaptations</h4>
                 <div className="flex gap-3 overflow-x-auto pb-2">
                    {/* List Podcasts */}
                    {selectedArticle.podcasts.map(p => (
                       <button
                         key={p.id}
                         onClick={() => { setActiveFormat(ConsumerFormat.PODCAST_STATIC); playStoredPodcast(p.audioBase64); }}
                         className="flex items-center gap-3 p-2 pr-4 bg-purple-50 hover:bg-purple-100 border border-purple-100 rounded-lg transition-colors group flex-shrink-0"
                       >
                          <div className="w-8 h-8 bg-purple-200 rounded-md flex items-center justify-center text-purple-700 group-hover:scale-105 transition-transform">
                             <FileAudio className="w-4 h-4" />
                          </div>
                          <div className="text-left">
                             <div className="text-xs font-bold text-purple-900">Audio</div>
                             <div className="text-[10px] text-purple-600 truncate max-w-[100px]">{p.profileDescription}</div>
                          </div>
                       </button>
                    ))}
                    
                    {/* List Texts */}
                    {selectedArticle.adaptations.map(a => (
                       <button
                         key={a.id}
                         onClick={() => loadAdaptation(a)}
                         className="flex items-center gap-3 p-2 pr-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-lg transition-colors group flex-shrink-0"
                       >
                          <div className="w-8 h-8 bg-emerald-200 rounded-md flex items-center justify-center text-emerald-700 group-hover:scale-105 transition-transform">
                             {a.profileDescription.includes('Comic') ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                          </div>
                          <div className="text-left">
                             <div className="text-xs font-bold text-emerald-900">{a.profileDescription.includes('Comic') ? 'Comic' : 'Text'}</div>
                             <div className="text-[10px] text-emerald-600 truncate max-w-[100px]">{a.profileDescription}</div>
                          </div>
                       </button>
                    ))}
                 </div>
              </div>
            )}
          </>
        )}
      </div>

      {showLiveSession && selectedArticle && (
        <LiveSession 
          article={selectedArticle} 
          profile={profile} 
          onClose={() => setShowLiveSession(false)} 
        />
      )}
    </div>
  );
};

export default ConsumerDashboard;