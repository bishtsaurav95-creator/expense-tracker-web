import React, { useState, useEffect } from 'react';
import { fetchCategoriesOfflineFirst } from '../offlineSync';

export default function EditExpenseModal({ expense, isOpen, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState([]);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch categories when modal opens (offline-first)
  useEffect(() => {
    if (isOpen) {
      fetchCategoriesOfflineFirst()
        .then((data) => {
          if (Array.isArray(data)) {
            const sorted = [...data].sort((a, b) => {
              if (a.name.toLowerCase() === 'other') return 1;
              if (b.name.toLowerCase() === 'other') return -1;
              return a.name.localeCompare(b.name);
            });
            setCategories(sorted);
          }
        })
        .catch((err) => console.error('Error fetching categories:', err));
    }
  }, [isOpen]);

  useEffect(() => {
    if (expense) {
      setTitle(expense.title || '');
      setCategoryId(expense.category_id ? String(expense.category_id) : '');
      setAmount(expense.amount ? String(expense.amount) : '');
      setDate(expense.date ? expense.date.slice(0, 10) : '');
      setError('');
    }
  }, [expense]);

  if (!isOpen || !expense) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !amount) {
      setError('Title and amount are required.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onSave({
        id: expense.id,
        title,
        category_id: categoryId ? parseInt(categoryId, 10) : null,
        amount: parseFloat(amount),
        date: date || (expense.date ? expense.date.slice(0, 10) : new Date().toLocaleDateString('en-CA')),
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update expense.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 sm:px-6 sm:py-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2">
            ✏️ Edit Expense
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1.5 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3.5 sm:space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-md text-xs sm:text-sm">
              {error}
            </div>
          )}

          <div className="text-left">
            <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">Item Name</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Lunch"
              required
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-base sm:text-sm text-left"
            />
          </div>

          <div className="text-left">
            <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-base sm:text-sm bg-white text-left"
            >
              <option value="">Select Category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="text-left">
            <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">Price (₹)</label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 150"
              required
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-base sm:text-sm text-left"
            />
          </div>

          <div className="text-left">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs sm:text-sm font-medium text-gray-600 text-left">Date</label>
              <span className="text-[11px] text-gray-400 font-normal">Optional (defaults to Today)</span>
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-base sm:text-sm text-left"
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-xs sm:text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {loading ? 'Saving...' : 'Update Expense'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
