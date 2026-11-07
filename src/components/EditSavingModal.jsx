import React, { useState, useEffect } from 'react';
import { fetchSavingCategoriesOfflineFirst } from '../offlineSync';

export default function EditSavingModal({ saving, isOpen, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState([]);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch saving categories when modal opens (offline-first)
  useEffect(() => {
    if (isOpen) {
      fetchSavingCategoriesOfflineFirst()
        .then((data) => {
          if (Array.isArray(data)) {
            setCategories(data);
          }
        })
        .catch((err) => console.error('Error fetching saving categories:', err));
    }
  }, [isOpen]);

  useEffect(() => {
    if (saving) {
      setTitle(saving.title || '');
      setCategoryId(saving.category_id ? String(saving.category_id) : '');
      setAmount(saving.amount ? String(saving.amount) : '');
      setDate(saving.date ? saving.date.slice(0, 10) : '');
      setError('');
    }
  }, [saving]);

  if (!isOpen || !saving) return null;

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
        id: saving.id,
        title,
        category_id: categoryId ? parseInt(categoryId, 10) : null,
        amount: parseFloat(amount),
        date: date || (saving.date ? saving.date.slice(0, 10) : new Date().toLocaleDateString('en-CA')),
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update saving.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 text-left">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-left">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 sm:px-6 sm:py-4 border-b border-gray-100 bg-emerald-50/40 text-left">
          <h3 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2 text-left">
            <span>✏️ Edit Saving Entry</span>
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 rounded-lg p-1.5 transition-colors text-lg leading-none cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3.5 sm:space-y-4 text-left">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-md text-xs sm:text-sm text-left">
              {error}
            </div>
          )}

          <div className="text-left">
            <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">
              Saving Title / Asset Name
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. HDFC SIP, Emergency Fund"
              required
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-500 text-base sm:text-sm text-left"
            />
          </div>

          <div className="text-left">
            <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">
              Saving Category
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-500 text-base sm:text-sm bg-white text-left"
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
            <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">
              Deposit / Amount (₹)
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 5000"
              required
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-500 text-base sm:text-sm text-left"
            />
          </div>

          <div className="text-left">
            <div className="flex items-center justify-between mb-1 text-left">
              <label className="block text-xs sm:text-sm font-medium text-gray-600 text-left">Date</label>
              <span className="text-[11px] text-gray-400 font-normal">Optional (defaults to Today)</span>
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-500 text-base sm:text-sm text-left"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 text-xs sm:text-sm font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {loading ? 'Saving...' : 'Update Saving'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}

