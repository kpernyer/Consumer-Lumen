import React, { useState, useEffect } from 'react';
import { Article, UserRole } from './types';
import ProducerDashboard from './components/ProducerDashboard';
import ConsumerDashboard from './components/ConsumerDashboard';
import { Layers, Zap, Database } from 'lucide-react';
import { getAllArticles, saveArticleToDB, saveAllArticlesToDB } from './services/storage';

// Seed data
const INITIAL_ARTICLES: Article[] = [
  {
    id: '1',
    title: 'The Future of Quantum Computing',
    content: "Quantum computing is a type of computation whose operations can exploit the phenomena of superposition, interference, and entanglement. Devices that perform quantum computations are known as quantum computers. \n\nThough current quantum computers are too small to outperform usual (classical) computers for practical applications, they are believed to be capable of solving certain computational problems, such as integer factorization (which underlies RSA encryption), substantially faster than classical computers. The study of quantum computing is a subfield of quantum information science.",
    author: 'Dr. Smith',
    certified: true,
    enhanced: false,
    tags: ['Tech', 'Science'],
    podcasts: [],
    adaptations: [],
    lastUpdated: '2023-10-27'
  }
];

const App: React.FC = () => {
  const [currentRole, setCurrentRole] = useState<UserRole>(UserRole.PRODUCER);
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load data from IndexedDB on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const storedArticles = await getAllArticles();
        if (storedArticles.length > 0) {
          setArticles(storedArticles);
        } else {
          // Seed DB if empty
          await saveAllArticlesToDB(INITIAL_ARTICLES);
          setArticles(INITIAL_ARTICLES);
        }
      } catch (err) {
        console.error("Failed to initialize data:", err);
        setArticles(INITIAL_ARTICLES); // Fallback
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
  }, []);

  // Persist changes to IndexedDB whenever articles change
  useEffect(() => {
    if (!isLoaded) return;
    
    // We save each article individually to ensure the DB stays in sync.
    // In a high-frequency update scenario, we might debounce this, 
    // but for this app's usage patterns, this ensures robustness.
    articles.forEach(article => {
      saveArticleToDB(article).catch(e => console.error("Auto-save failed for", article.id, e));
    });
  }, [articles, isLoaded]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-pulse">
           <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
           </div>
           <p className="text-slate-500 font-medium">Loading Knowledge Base...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
              KnowledgeLoop AI
            </h1>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-lg">
             <button
               onClick={() => setCurrentRole(UserRole.PRODUCER)}
               className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${currentRole === UserRole.PRODUCER ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
             >
               <Layers className="w-4 h-4" /> Producer
             </button>
             <button
               onClick={() => setCurrentRole(UserRole.CONSUMER)}
               className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${currentRole === UserRole.CONSUMER ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
             >
               <Zap className="w-4 h-4" /> Consumer
             </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 h-[calc(100vh-64px)]">
        {currentRole === UserRole.PRODUCER ? (
          <ProducerDashboard articles={articles} setArticles={setArticles} />
        ) : (
          <ConsumerDashboard articles={articles} setArticles={setArticles} />
        )}
      </main>
    </div>
  );
};

export default App;