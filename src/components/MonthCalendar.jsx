import React from 'react';

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * A locked calendar grid for a specific month + year.
 * No prev/next navigation — renders only the given month.
 *
 * Props:
 *  year        {number}  e.g. 2026
 *  month       {number}  1-based, e.g. 11 for November
 *  selected    {string}  "YYYY-MM-DD" or ''
 *  onSelect    {fn}      called with "YYYY-MM-DD" or '' (toggle off)
 */
export default function MonthCalendar({ year, month, selected, onSelect }) {
  // Days in this month
  const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-based so month=11 → Oct days; pass month=12 for Nov? No: new Date(y, m, 0) gives last day of month m-1 in JS (0-based). So new Date(y, month, 0) gives last day of `month` (1-based). ✓
  // Day of week the 1st falls on (0=Sun … 6=Sat)
  const startDay = new Date(year, month - 1, 1).getDay();

  // Build cell array: nulls for leading blanks + day numbers
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const pad = (n) => String(n).padStart(2, '0');

  const handleClick = (day) => {
    const dateStr = `${year}-${pad(month)}-${pad(day)}`;
    // Toggle off if same date clicked again
    onSelect(selected === dateStr ? '' : dateStr);
  };

  return (
    <div className="mt-3 select-none">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, idx) => {
          if (!day) return <div key={`blank-${idx}`} />;

          const dateStr = `${year}-${pad(month)}-${pad(day)}`;
          const isSelected = selected === dateStr;

          return (
            <button
              key={dateStr}
              onClick={() => handleClick(day)}
              className={`
                mx-auto w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium
                transition-colors duration-150
                ${isSelected
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'}
              `}
            >
              {day}
            </button>
          );
        })}
      </div>


    </div>
  );
}

