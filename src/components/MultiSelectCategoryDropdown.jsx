import React, { useState, useRef, useEffect } from 'react';

/**
 * MultiSelectCategoryDropdown
 *
 * Props:
 *  categories   {Array<{id: number, name: string}>}
 *  selectedIds  {Array<number|string>}
 *  onChange     {function(newIds: Array<number|string>)}
 *  disabled     {boolean}
 */
export default function MultiSelectCategoryDropdown({
  categories = [],
  selectedIds = [],
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

  // Filter categories by search
  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const isAllSelected =
    categories.length > 0 && selectedIds.length === categories.length;

  const handleToggle = (id) => {
    const numericId = parseInt(id, 10);
    if (selectedIds.includes(numericId)) {
      onChange(selectedIds.filter((item) => item !== numericId));
    } else {
      onChange([...selectedIds, numericId]);
    }
  };

  const handleSelectAll = () => {
    onChange(categories.map((c) => c.id));
  };

  const handleClearAll = (e) => {
    e?.stopPropagation();
    onChange([]);
  };

  // Preview label for trigger button
  const getTriggerText = () => {
    if (disabled) return 'Select month/year first';
    if (selectedIds.length === 0) return 'All Categories';
    if (selectedIds.length === 1) {
      const cat = categories.find((c) => c.id === selectedIds[0]);
      return cat ? cat.name : '1 Category';
    }
    if (selectedIds.length === categories.length) return 'All Categories';
    return `${selectedIds.length} Categories Selected`;
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
          <span className="text-gray-400 shrink-0">🏷️</span>
          <span
            className={`truncate text-left ${
              disabled
                ? 'text-gray-400 text-xs sm:text-sm'
                : selectedIds.length > 0
                ? 'font-medium text-blue-700'
                : 'text-gray-600'
            }`}
          >
            {getTriggerText()}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          {!disabled && selectedIds.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="p-1 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-100 transition-colors"
              title="Clear category selection"
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
              placeholder="Search category..."
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

          {/* Categories List */}
          <div className="max-h-48 overflow-y-auto space-y-0.5 divide-y divide-gray-50 pr-0.5">
            {filteredCategories.length === 0 ? (
              <div className="py-4 text-center text-xs text-gray-400">
                No categories matching "{searchQuery}"
              </div>
            ) : (
              filteredCategories.map((c) => {
                const isSelected = selectedIds.includes(c.id);

                return (
                  <div
                    key={c.id}
                    onClick={() => handleToggle(c.id)}
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
                      <span className="truncate text-left text-gray-800">{c.name}</span>
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
            <span>{selectedIds.length} of {categories.length} selected</span>
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

