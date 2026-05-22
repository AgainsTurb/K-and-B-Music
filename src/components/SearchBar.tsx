// src/components/SearchBar.tsx
import { useState, FormEvent, useEffect } from 'react';
import { getSearchPrediction } from '../services/bilibili';
import { useTranslation } from 'react-i18next';

interface SearchBarProps {
    onSearch: (keyword: string) => void;
    isLoading: boolean;
    onOpenSettings: () => void;
    onToggleMiniMode: () => void;
}

export default function SearchBar({ onSearch, isLoading, onOpenSettings, onToggleMiniMode }: SearchBarProps) {
    const [input, setInput] = useState('');
    const [history, setHistory] = useState<string[]>([]);
    const [predictions, setPredictions] = useState<string[]>([]);
    const [isFocused, setIsFocused] = useState(false);

    const { t } = useTranslation();

    useEffect(() => {
        const saved = localStorage.getItem('search_history');
        if (saved) setHistory(JSON.parse(saved));
    }, []);

    const saveToHistory = (term: string) => {
        const newHistory = [term, ...history.filter(h => h !== term)].slice(0, 20);
        setHistory(newHistory);
        localStorage.setItem('search_history', JSON.stringify(newHistory));
    };

    const handleDeleteHistory = (e: React.MouseEvent, term: string) => {
        e.preventDefault();
        e.stopPropagation();
        const newHistory = history.filter(h => h !== term);
        setHistory(newHistory);
        localStorage.setItem('search_history', JSON.stringify(newHistory));
    };

    const handleClearHistory = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setHistory([]);
        localStorage.removeItem('search_history');
    };

    const executeSearch = (term: string) => {
        if (!term.trim() || isLoading) return;
        setInput(term);
        setIsFocused(false);
        saveToHistory(term);
        onSearch(term);
    };

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        executeSearch(input);
    };

    const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInput(val);
        
        if (val.trim()) {
            const preds = await getSearchPrediction(val.trim());
            if (preds.length > 0) setPredictions(preds);
        } else {
            setPredictions([]);
        }
    };

    return (
    <header className="pt-6 px-8 pb-4 shrink-0 relative z-20">
      <div className="w-full max-w-2xl relative flex items-center gap-4">
        <form 
          onSubmit={handleSubmit} 
          className="flex-1 rounded-full flex items-center px-6 py-3 focus-within:ring-2 focus-within:ring-[#0b57d0] transition-all shadow-sm bg-[#eff1f4] dark:bg-gray-800 focus-within:bg-white dark:focus-within:bg-gray-900"
        >
          <svg className="w-5 h-5 text-gray-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
          <input 
            type="text" 
            placeholder={t('Search for music... ')}
            className="bg-transparent outline-none w-full text-gray-800 dark:text-gray-100"
            value={input}
            onChange={handleInputChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={isLoading}
          />
        </form>

        <button 
          onClick={onToggleMiniMode}
          className="p-3.5 rounded-full transition-colors shrink-0 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
          title="Mini Player"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 9L4 4m5 5v-4m0 4H5m10 0l5-5m-5 5v-4m0 4h4M9 15l-5 5m5-5v4m0-4H5m10 0l5 5m-5-5v4m0-4h4" />
          </svg>
        </button>

        {/* THE NEW CLEAN SETTINGS BUTTON */}
        <button 
          onClick={onOpenSettings}
          className="p-3.5 rounded-full transition-colors shrink-0 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        </button>

        {/* Dropdown Modal for History & Predictions (unmodified) */}
        {isFocused && (history.length > 0 || predictions.length > 0) && (
          <div className="absolute top-full left-0 w-full mt-2 rounded-2xl shadow-xl border overflow-hidden py-3 z-50 bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800">
            {history.length > 0 && !input.trim() && (
              <div className="px-4">
                <div className="flex justify-between items-center mb-3 px-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('Search History')}</span>
                  <button onMouseDown={handleClearHistory} className="text-xs font-semibold transition-colors text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400">{t('Clear All')}</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {history.map(term => (
                    <div key={term} onMouseDown={(e) => { e.preventDefault(); executeSearch(term); }} className="group flex items-center border rounded-full pl-4 pr-1.5 py-1.5 cursor-pointer transition-all bg-gray-50 dark:bg-gray-800 hover:bg-[#d3e3fd] dark:hover:bg-gray-700 hover:text-[#0b57d0] border-gray-200 dark:border-gray-700 hover:border-[#b4cffb] dark:hover:border-gray-600">
                      <span className="text-sm font-medium mr-1 dark:text-gray-200">{term}</span>
                      <button onMouseDown={(e) => handleDeleteHistory(e, term)} className="p-1 rounded-full opacity-0 group-hover:opacity-100 transition-all text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {predictions.length > 0 && input.trim() && (
              <div className="flex flex-col">
                {predictions.map(pred => (
                  <div key={pred} onMouseDown={(e) => { e.preventDefault(); executeSearch(pred); }} className="px-6 py-2.5 cursor-pointer flex items-center gap-4 transition-colors group hover:bg-gray-50 dark:hover:bg-gray-800">
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-[#0b57d0]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    <span className="text-sm font-medium group-hover:text-[#0b57d0] text-gray-700 dark:text-gray-300">{pred}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
    );
}