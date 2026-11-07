import React, { useState, useMemo } from 'react';

// Format "2026-11-01" → "Fri, 1 Nov 2026"
function formatDate(dateStr) {
  if (!dateStr) return 'Unknown Date';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Trash icon SVG
function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

// Edit (Pencil) icon SVG
function EditIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

// Chevron icon SVG
function ChevronIcon({ open }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function SavingList({ data = [], onDeleteSaving, onEditSaving, hideTitle = false }) {

  // Group items by date — sorted newest first
  const grouped = useMemo(() => {
    const map = {};
    (data || []).forEach((item) => {
      const key = item.date || 'Unknown';
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    // Sort dates descending
    return Object.entries(map).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [data]);

  // Keep the most recent date open by default
  const [openDates, setOpenDates] = useState(() => {
    if (grouped.length > 0) return { [grouped[0][0]]: true };
    return {};
  });

  const toggleDate = (dateKey) => {
    setOpenDates((prev) => ({ ...prev, [dateKey]: !prev[dateKey] }));
  };

  return (
    <div className="text-left">
      {!hideTitle && (
        <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-3 sm:mb-4 text-left">
          Recent Savings
        </h3>
      )}

      {grouped.length === 0 ? (
        <p className="text-gray-500 text-center bg-white p-6 rounded-xl shadow-xs text-sm">
          No savings added yet.
        </p>
      ) : (
        <div className="space-y-2.5 sm:space-y-3">
          {grouped.map(([dateKey, items]) => {
            const isOpen = !!openDates[dateKey];
            const dayTotal = items.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0);

            return (
              <div key={dateKey} className="bg-white rounded-xl shadow-xs border border-gray-100 overflow-hidden text-left">

                {/* Accordion Header */}
                <button
                  type="button"
                  onClick={() => toggleDate(dateKey)}
                  className="w-full flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-l-4 border-emerald-500 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center justify-start gap-1.5 sm:gap-2 min-w-0 pr-2 text-left">
                    <ChevronIcon open={isOpen} />
                    <span className="font-semibold text-gray-800 text-xs sm:text-sm md:text-base truncate text-left">
                      {formatDate(dateKey)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <span className="text-xs text-gray-400 font-medium hidden sm:inline">
                      {items.length} {items.length !== 1 ? 'deposits' : 'deposit'}
                    </span>
                    <span className="font-bold text-emerald-600 text-xs sm:text-sm md:text-base">
                      ₹{dayTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </button>

                {/* Accordion Body */}
                {isOpen && (
                  <div className="divide-y divide-gray-100 bg-white text-left">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-gray-50/70 transition-colors gap-2 text-left"
                      >
                        {/* Title & Category (Strictly Left-Aligned) */}
                        <div className="flex flex-col items-start justify-center flex-1 min-w-0 pr-2 text-left">
                          <div className="flex items-center justify-start gap-1.5 flex-wrap text-left w-full">
                            <span className="text-sm sm:text-base font-medium text-gray-800 break-words text-left">
                              {item.title}
                            </span>
                            {item.isOffline && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                                ⚡ Offline
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded mt-0.5 text-left self-start font-medium">
                            {item.category || 'General Saving'}
                          </span>
                        </div>

                        {/* Price & Actions */}
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
                          <span className="text-sm sm:text-base font-bold text-emerald-600 whitespace-nowrap text-right">
                            ₹{parseFloat(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>

                          <div className="flex items-center gap-0.5 border-l border-gray-100 pl-1.5 sm:pl-2">
                            {/* Delete Button */}
                            <button
                              type="button"
                              onClick={() => onDeleteSaving && onDeleteSaving(item.id)}
                              title="Delete saving"
                              className="text-gray-400 hover:text-red-500 active:scale-90 transition-transform p-1.5 rounded hover:bg-red-50 cursor-pointer"
                            >
                              <TrashIcon />
                            </button>

                            {/* Edit Button */}
                            {onEditSaving && (
                              <button
                                type="button"
                                onClick={() => onEditSaving(item)}
                                title="Edit saving"
                                className="text-gray-400 hover:text-emerald-600 active:scale-90 transition-transform p-1.5 rounded hover:bg-emerald-50 cursor-pointer"
                              >
                                <EditIcon />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

