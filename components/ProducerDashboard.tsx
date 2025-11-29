import React, { useState, useRef, useEffect } from 'react';
import { Article } from '../types';
import { assistProducer } from '../services/gemini';
import { PenTool, CheckCircle, Wand2, Save, FileText, ChevronDown, Sparkles, MoveRight, FilePlus, BadgeCheck, Star } from 'lucide-react';

interface ProducerDashboardProps {
  articles: Article[];
  setArticles: React.Dispatch<React.SetStateAction<Article[]>>;
}

const ProducerDashboard: React.FC<ProducerDashboardProps> = ({ articles, setArticles }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [author, setAuthor] = useState('Kenneth Pernyer');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Status flags
  const [certified, setCertified] = useState(false);
  const [enhanced, setEnhanced] = useState(false);

  const [showAiMenu, setShowAiMenu] = useState(false);
  
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowAiMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAiAssist = async (mode: 'draft' | 'continue' | 'polish') => {
    // Validation Logic
    if (mode === 'draft' && !title.trim()) {
      alert("Please enter a Title to give the AI a topic to draft.");
      return;
    }
    if ((mode === 'continue' || mode === 'polish') && !content.trim()) {
      alert("Please write some content first so the AI has something to work with.");
      return;
    }

    setShowAiMenu(false);
    setIsGenerating(true);
    
    try {
      const result = await assistProducer(title, content, mode);
      
      if (!result) throw new Error("No content generated");

      if (mode === 'continue') {
        setContent(prev => prev + (prev ? "\n\n" : "") + result);
      } else {
        setContent(result);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to process AI request. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = () => {
    if (!title.trim() || !content.trim()) return;
    
    try {
        // Fallback ID generation if crypto.randomUUID is not available
        const generateId = () => {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                return crypto.randomUUID();
            }
            return Date.now().toString(36) + Math.random().toString(36).substring(2);
        };

        const newArticle: Article = {
          id: generateId(),
          title: title.trim(),
          content: content,
          author: author.trim() || 'Kenneth Pernyer',
          certified: certified,
          enhanced: enhanced,
          tags: ['New'],
          podcasts: [],
          adaptations: [],
          lastUpdated: new Date().toLocaleDateString()
        };
        
        // Add to beginning of list
        setArticles(prev => [newArticle, ...prev]);
        
        // Reset form (keep author)
        setTitle('');
        setContent('');
        setCertified(false);
        setEnhanced(false);
    } catch (error) {
        console.error("Error saving article:", error);
        alert("Failed to save article. Please try again.");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
      {/* Sidebar: Existing Knowledge */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 lg:col-span-1 overflow-y-auto max-h-[calc(100vh-140px)]">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          Knowledge Base
        </h2>
        <div className="space-y-3">
          {articles.map(art => (
            <div key={art.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-blue-300 transition-colors">
              <h3 className="font-medium text-slate-900 text-sm">{art.title}</h3>
              <p className="text-xs text-slate-500 mt-1">By {art.author}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {art.certified && (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                    <BadgeCheck className="w-3 h-3" /> Certified
                  </span>
                )}
                {art.enhanced && (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                    <Star className="w-3 h-3" /> Enhanced
                  </span>
                )}
              </div>
               <span className="text-xs text-slate-400 block mt-1 text-right">{art.lastUpdated}</span>
            </div>
          ))}
          {articles.length === 0 && (
            <p className="text-slate-400 text-sm text-center py-10">No articles yet.</p>
          )}
        </div>
      </div>

      {/* Main Editor */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 lg:col-span-2 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <PenTool className="w-6 h-6 text-indigo-600" />
            Producer Studio
          </h2>
          <div className="relative" ref={menuRef}>
            <button 
              type="button"
              onClick={() => setShowAiMenu(!showAiMenu)}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 font-medium transition-colors disabled:opacity-50 border border-indigo-100"
            >
              <Wand2 className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
              {isGenerating ? 'Working...' : 'AI Assist'}
              <ChevronDown className="w-3 h-3 ml-1 opacity-70" />
            </button>

            {showAiMenu && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                <div className="p-2 space-y-1">
                  <button 
                    type="button"
                    onClick={() => handleAiAssist('draft')}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-3 transition-colors"
                  >
                    <div className="p-1.5 bg-blue-100 text-blue-600 rounded-md">
                      <FilePlus className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-medium">Draft Article</div>
                      <div className="text-xs text-slate-400">Write from scratch</div>
                    </div>
                  </button>
                  
                  <button 
                    type="button"
                    onClick={() => handleAiAssist('continue')}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-3 transition-colors"
                  >
                     <div className="p-1.5 bg-green-100 text-green-600 rounded-md">
                      <MoveRight className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-medium">Continue Writing</div>
                      <div className="text-xs text-slate-400">Expand current text</div>
                    </div>
                  </button>

                  <button 
                    type="button"
                    onClick={() => handleAiAssist('polish')}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-3 transition-colors"
                  >
                     <div className="p-1.5 bg-purple-100 text-purple-600 rounded-md">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-medium">Polish & Fix</div>
                      <div className="text-xs text-slate-400">Improve tone & grammar</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
             <input
              type="text"
              placeholder="Article Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="col-span-2 lg:col-span-1 w-full text-lg font-bold text-slate-900 placeholder:text-slate-300 border border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
            <input
              type="text"
              placeholder="Author Name"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="col-span-2 lg:col-span-1 w-full text-sm font-medium text-slate-600 placeholder:text-slate-300 border border-slate-200 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
        </div>

        <textarea
          placeholder="Start writing your knowledge article here... Use AI Assist to Draft, Continue, or Polish."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="flex-1 w-full resize-none border border-slate-200 rounded-lg p-4 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-700 leading-relaxed outline-none"
        />

        <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${certified ? 'bg-green-500 border-green-500' : 'bg-white border-slate-300'}`}>
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={certified} 
                    onChange={() => setCertified(!certified)} 
                  />
                  {certified && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                </div>
                <span className="text-sm font-medium text-slate-700">Certified Source</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${enhanced ? 'bg-purple-500 border-purple-500' : 'bg-white border-slate-300'}`}>
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={enhanced} 
                    onChange={() => setEnhanced(!enhanced)} 
                  />
                  {enhanced && <Star className="w-3.5 h-3.5 text-white" />}
                </div>
                <span className="text-sm font-medium text-slate-700">Enhanced</span>
              </label>
          </div>

          <button 
            type="button"
            onClick={handleSave}
            disabled={!title.trim() || !content.trim()}
            className="flex items-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            Publish to KB
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProducerDashboard;