import React, { useState, useEffect, useRef } from 'react';

/**
 * AutocompleteInput — Auto-suggests item names based on past database records
 * after typing >= 3 characters.
 *
 * Selecting a suggestion fills the name and auto-fills its past category.
 */
export default function AutocompleteInput({
  value = '',
  onChange,
  onSelect,
  fetchSuggestions,
  placeholder = '',
  required = false,
  type = 'expense', // 'expense' | 'saving'
  className = '',
  id,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const wrapperRef = useRef(null);
  const isSelectedRef = useRef(false);

  // Debounced search when value has at least 3 characters
  useEffect(() => {
    // If the value changed because user just selected a suggestion, don't re-trigger dropdown
    if (isSelectedRef.current) {
      isSelectedRef.current = false;
      return;
    }

    const trimmed = (value || '').trim();
    if (trimmed.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        if (typeof fetchSuggestions === 'function') {
          const results = await fetchSuggestions(trimmed);
          if (isMounted) {
            const list = Array.isArray(results) ? results : [];
            setSuggestions(list);
            setIsOpen(list.length > 0);
            setHighlightedIndex(-1);
          }
        }
      } catch (err) {
        if (isMounted) {
          setSuggestions([]);
          setIsOpen(false);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }, 220); // 220ms debounce

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [value, fetchSuggestions]);

  // Click outside to dismiss dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleSelect = (item) => {
    isSelectedRef.current = true;
    if (onChange) onChange(item.title);
    if (onSelect) onSelect(item);
    setIsOpen(false);
    setSuggestions([]);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && (value || '').trim().length >= 3 && suggestions.length > 0) {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        e.preventDefault(); // Stop premature form submission
        handleSelect(suggestions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const isSaving = type === 'saving';

  return (
    <div ref={wrapperRef} className="relative w-full text-left">
      <div className="relative">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => {
            isSelectedRef.current = false;
            if (onChange) onChange(e.target.value);
          }}
          onFocus={() => {
            if (suggestions.length > 0 && (value || '').trim().length >= 3) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          className={`${className} ${loading ? 'pr-9' : ''}`}
        />

        {/* Loading Spinner */}
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center">
            <svg
              className={`animate-spin h-4 w-4 ${isSaving ? 'text-emerald-500' : 'text-blue-500'}`}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Floating Suggestions Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-gray-100 py-1 text-left animate-fadeIn">
          {/* Header */}
          <div className="px-3 py-1.5 text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/80 select-none flex items-center justify-between">
            <span className="flex items-center gap-1">
              <span>{isSaving ? '💰' : '🔍'}</span>
              <span>Past Suggestions</span>
            </span>
            <span className="text-[10px] text-gray-400 font-normal">Auto-fills Category</span>
          </div>

          {/* Suggestion items */}
          {suggestions.map((item, idx) => {
            const isHighlighted = idx === highlightedIndex;
            return (
              <div
                key={`${item.title}-${idx}`}
                onPointerDown={(e) => {
                  e.preventDefault(); // Prevents input blur before select
                  handleSelect(item);
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`px-3 py-2.5 sm:py-2 text-sm cursor-pointer flex items-center justify-between gap-2 transition-colors select-none ${
                  isHighlighted
                    ? isSaving
                      ? 'bg-emerald-50 text-emerald-950 font-medium'
                      : 'bg-blue-50 text-blue-950 font-medium'
                    : 'text-gray-800 hover:bg-gray-50 active:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-2 truncate flex-1 min-w-0 text-left">
                  <span className="text-gray-400 text-xs">↳</span>
                  <span className="truncate font-medium text-gray-900">{item.title}</span>
                </div>

                {item.category_name && (
                  <span
                    className={`shrink-0 text-[11px] px-2 py-0.5 rounded-md font-semibold border ${
                      isSaving
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}
                  >
                    {item.category_name}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
