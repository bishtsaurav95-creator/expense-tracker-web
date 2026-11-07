import React, { useState, useRef, useEffect } from 'react';
import MonthCalendar from './MonthCalendar';

/**
 * A read-only input that opens a locked MonthCalendar as a dropdown.
 *
 * Props:
 *  year        {number}  e.g. 2026
 *  month       {number}  1-based e.g. 11
 *  selected    {string}  "YYYY-MM-DD" or ''
 *  onSelect    {fn}      called with "YYYY-MM-DD" or ''
 *  disabled    {bool}
 */
export default function DatePickerInput({ year, month, selected, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (dateStr) => {
    onSelect(dateStr);
    if (dateStr) setOpen(false); // close after picking (keep open on deselect toggle)
  };

  const displayValue = selected
    ? new Date(selected + 'T00:00:00').toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : '';

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input box */}
      <div
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`
          flex items-center justify-between w-full px-2.5 py-2 sm:py-2.5 border rounded-lg text-base sm:text-sm select-none
          transition-colors duration-150
          ${disabled
            ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
            : open
              ? 'border-blue-500 bg-white cursor-pointer ring-2 ring-blue-100'
              : 'border-gray-300 bg-white hover:border-gray-400 cursor-pointer'
          }
        `}
      >
        <span className={selected ? 'text-gray-800' : 'text-gray-400'}>
          {displayValue || 'Select a date'}
        </span>
        <span className="flex items-center gap-1">
          {/* Clear button (×) */}
          {selected && !disabled && (
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(''); setOpen(false); }}
              className="text-gray-400 hover:text-red-500 transition-colors px-1"
              title="Clear date"
            >
              ✕
            </button>
          )}
          {/* Calendar icon */}
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${disabled ? 'text-gray-300' : 'text-gray-400'}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </span>
      </div>

      {/* Dropdown calendar */}
      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-blue-200 rounded-lg shadow-lg p-3">
          <MonthCalendar
            year={year}
            month={month}
            selected={selected}
            onSelect={handleSelect}
          />
        </div>
      )}
    </div>
  );
}

