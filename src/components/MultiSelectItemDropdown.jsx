import React, { useState, useRef, useEffect } from 'react';

/**
 * MultiSelectItemDropdown
 *
 * Props:
 *  items             {Array<{title: string, category?: string, category_id?: number}>}
 *  selectedTitles    {Array<string>}
 *  onChange          {function(newTitles: Array<string>)}
 *  disabled          {boolean}
 */
export default function MultiSelectItemDropdown({
  items = [],
  selectedTitles = [],
  onChange,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Normalize items to unique title objects
  const uniqueItems = React.useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      const title = typeof item === 'string' ? item : item?.title;
      if (!title) return;
      if (!map.has(title)) {
        map.set(title, {
          title,
          category: typeof item === 'object' ? item.category : '',
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [items]);

  // Filter items by search query
  const filteredItems = uniqueItems.filter((item) =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const handleToggle = (title) => {
    if (selectedTitles.includes(title)) {
      onChange(selectedTitles.filter((t) => t !== title));
    } else {
      onChange([...selectedTitles, title]);
    }
  };

  const handleSelectAll = () => {
    onChange(uniqueItems.map((i) => i.title));
  };

  const handleClearAll = (e) => {
    e?.stopPropagation();
    onChange([]);
  };

  // Preview label for trigger button
  const getTriggerText = () => {
    if (disabled) return 'Select month/year first';
    if (selectedTitles.length === 0) return 'All Items';
    if (selectedTitles.length === 1) return selectedTitles[0];
    if (selectedTitles.length === uniqueItems.length && uniqueItems.length > 0) return 'All Items';
    return `${selectedTitles.length} Items Selected`;
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger Button */}
      <div
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={`
          flex items-center justify-between w-full px-2.5 py-2 sm:py-2.5 border rounded-lg text-base sm:text-sm transition-all duration-150 select-none text-left
          ${
            disabled
              ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
              : isOpen
              ? 'bg-white border-blue-500 ring-2 ring-blue-100 cursor-pointer text-gray-800'
              : 'bg-white border-gray-300 hover:border-gray-400 cursor-pointer text-gray-800'
          }
        `}
      >
        <div className="flex items-center gap-1.5 min-w-0 truncate text-left">
          <span className="text-gray-400 shrink-0">📦</span>
          <span
            className={`truncate text-left ${
              disabled
                ? 'text-gray-400 text-xs sm:text-sm'
                : selectedTitles.length > 0
                ? 'font-medium text-blue-700'
                : 'text-gray-600'
            }`}
          >
            {getTriggerText()}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          {!disabled && selectedTitles.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="p-1 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-100 transition-colors"
              title="Clear item selection"
            >
              ✕
            </button>
          )}
          <span
            className={`text-xs text-gray-400 transform transition-transform duration-150 ${
              isOpen ? 'rotate-180' : ''
            }`}
          >
            ▼
          </span>
        </div>
      </div>

      {/* Dropdown Menu */}
      {!disabled && isOpen && (
        <div className="absolute left-0 right-0 z-40 mt-1.5 bg-white rounded-xl shadow-xl border border-gray-200 p-2.5 space-y-2 animate-in fade-in zoom-in-95 duration-100">
          
          {/* Search Box */}
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
              🔍
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items..."
              className="w-full pl-8 pr-7 py-1.5 border border-gray-200 rounded-lg text-base sm:text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Actions (Select All / Clear) */}
          <div className="flex items-center justify-between px-1 text-xs border-b border-gray-100 pb-1.5 text-gray-500 font-medium">
            <button
              type="button"
              onClick={handleSelectAll}
              className="hover:text-blue-600 text-blue-600 transition-colors cursor-pointer"
            >
              Select All
            </button>
            <span className="text-gray-300">|</span>
            <button
              type="button"
              onClick={handleClearAll}
              className="hover:text-red-600 text-gray-500 transition-colors cursor-pointer"
            >
              Clear Selection
            </button>
          </div>

          {/* Items List */}
          <div className="max-h-48 overflow-y-auto space-y-0.5 divide-y divide-gray-50 pr-0.5">
            {filteredItems.length === 0 ? (
              <div className="py-4 text-center text-xs text-gray-400">
                {uniqueItems.length === 0
                  ? 'No items found for selected filter'
                  : `No items matching "${searchQuery}"`}
              </div>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selectedTitles.includes(item.title);

                return (
                  <div
                    key={item.title}
                    onClick={() => handleToggle(item.title)}
                    className={`
                      flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-xs sm:text-sm select-none text-left
                      ${
                        isSelected
                          ? 'bg-blue-50/70 text-blue-900 font-medium'
                          : 'hover:bg-gray-50 text-gray-700'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // handled by parent onClick
                        className="w-4 h-4 shrink-0 rounded text-blue-600 focus:ring-blue-500 border-gray-300 pointer-events-none"
                      />
                      <span className="truncate text-left text-gray-800">{item.title}</span>
                      {item.category && (
                        <span className="shrink-0 text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-normal">
                          {item.category}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <span className="text-blue-600 text-xs font-semibold shrink-0 ml-1">✓</span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer note */}
          <div className="pt-1.5 border-t border-gray-100 text-[11px] text-gray-400 flex items-center justify-between px-1">
            <span>{selectedTitles.length} of {uniqueItems.length} selected</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-blue-600 font-semibold hover:underline"
            >
              Apply
            </button>
          </div>

        </div>
      )}
    </div>
  );
}

