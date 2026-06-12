import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { semanticSearch, type RAGResult } from '../lib/ragApi';
import { useStore } from '../context/StoreContext';

const SUGGESTIONS = [
  'minimalist black watch',
  'gold necklace for a wedding',
  'everyday silver bracelet',
  'luxury ring under $500',
  'anniversary gift jewelry',
];

const Search: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [draftQuery, setDraftQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<RAGResult[]>([]);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addToCart } = useStore();

  // Run search whenever `query` changes (debounced via explicit submit)
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setExplanation(null);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await semanticSearch(query, {
          matchThreshold: 0.25,
          matchCount: 12,
          explain: true,
        });
        if (!cancelled) {
          setResults(res.results);
          setExplanation(res.explanation);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = draftQuery.trim();
    if (!q) return;
    setSearchParams({ q });
    setQuery(q);
  };

  const handleSuggestion = (s: string) => {
    setDraftQuery(s);
    setSearchParams({ q: s });
    setQuery(s);
  };

  return (
    <div className="min-h-screen bg-white text-black pt-32 pb-40 px-6 md:px-16 lg:px-24">
      {/* Header */}
      <div className="max-w-4xl mx-auto space-y-12">
        <div className="space-y-4">
          <p className="text-[9px] uppercase tracking-[0.5em] text-gray-300 font-black">
            Archive Intelligence — Semantic Search
          </p>
          <h1 className="font-serif-elegant text-6xl md:text-8xl font-bold uppercase tracking-widest text-black">
            Search
          </h1>
        </div>

        {/* Search form */}
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex border-b-2 border-black items-center gap-4 pb-3">
            <SearchIcon size={18} strokeWidth={1} className="text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              value={draftQuery}
              onChange={e => setDraftQuery(e.target.value)}
              placeholder="Describe what you're looking for…"
              className="flex-1 bg-transparent text-xl md:text-2xl font-light tracking-wide outline-none placeholder:text-gray-300"
              autoFocus
            />
            <button
              type="submit"
              className="text-[9px] uppercase tracking-[0.4em] font-black px-6 py-3 border border-black hover:bg-black hover:text-white transition-all whitespace-nowrap"
            >
              Search
            </button>
          </div>
        </form>

        {/* Suggestion chips */}
        {!query && (
          <div className="space-y-4">
            <p className="text-[9px] uppercase tracking-[0.4em] text-gray-300 font-black">
              Try searching for
            </p>
            <div className="flex flex-wrap gap-3">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => handleSuggestion(s)}
                  className="text-[9px] uppercase tracking-[0.3em] font-black px-4 py-2 border border-black/20 hover:border-black hover:bg-black hover:text-white transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results area */}
      <div className="max-w-7xl mx-auto mt-20 space-y-12">
        {loading && (
          <div className="flex items-center gap-4 text-gray-400">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-[9px] uppercase tracking-[0.4em] font-black">
              Searching archive…
            </span>
          </div>
        )}

        {error && (
          <div className="text-[9px] uppercase tracking-[0.4em] font-black text-red-400">
            {error}
          </div>
        )}

        {/* LLM Explanation */}
        {explanation && !loading && (
          <div className="border-l-2 border-black pl-8 py-2 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles size={12} className="text-gray-400" />
              <span className="text-[8px] uppercase tracking-[0.4em] font-black text-gray-400">
                The Clerk's Curation
              </span>
            </div>
            <p className="font-clerk italic text-2xl text-gray-700 leading-relaxed">
              "{explanation}"
            </p>
          </div>
        )}

        {/* Results count */}
        {results.length > 0 && !loading && (
          <div className="flex items-center justify-between border-b border-black/10 pb-4">
            <p className="text-[9px] uppercase tracking-[0.4em] font-black text-gray-400">
              {results.length} pieces found for "{query}"
            </p>
            <Link
              to={`/?q=${encodeURIComponent(query)}`}
              className="flex items-center gap-2 text-[9px] uppercase tracking-[0.3em] font-black hover:underline"
            >
              View in store <ArrowRight size={10} />
            </Link>
          </div>
        )}

        {/* Product grid */}
        {results.length > 0 && !loading && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
            {results.map(item => (
              <div key={item.id} className="group space-y-4">
                <Link to={`/product/${item.id}`} className="block">
                  <div className="relative overflow-hidden bg-gray-50 aspect-[3/4]">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-100">
                        <span className="text-[9px] uppercase tracking-widest text-gray-300">No image</span>
                      </div>
                    )}
                    <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm px-2 py-1">
                      <span className="text-[7px] uppercase tracking-widest font-black text-gray-500">
                        {Math.round(item.similarity * 100)}%
                      </span>
                    </div>
                  </div>
                </Link>
                <div className="space-y-2">
                  <Link to={`/product/${item.id}`} className="block hover:underline">
                    <p className="text-[10px] uppercase tracking-[0.25em] font-black text-black leading-tight line-clamp-2">
                      {item.name}
                    </p>
                  </Link>
                  <p className="text-[11px] font-black text-black">${item.price}</p>
                  <p className="text-[8px] uppercase tracking-widest text-gray-400 font-black">{item.category}</p>
                  {item.description && (
                    <p className="text-[9px] text-gray-500 leading-relaxed line-clamp-2">{item.description}</p>
                  )}
                  <button
                    onClick={() => addToCart(item.id)}
                    className="w-full mt-2 py-2 text-[8px] uppercase tracking-[0.35em] font-black border border-black hover:bg-black hover:text-white transition-all"
                  >
                    Add to bag
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && query && results.length === 0 && !error && (
          <div className="text-center py-32 space-y-6">
            <p className="text-[10px] uppercase tracking-[0.5em] font-black text-gray-300">
              No archive matches for "{query}"
            </p>
            <p className="text-[9px] text-gray-400 leading-relaxed max-w-sm mx-auto">
              Try a more descriptive query — material, occasion, style, or color.
              The archive speaks in meaning, not just keywords.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Search;
