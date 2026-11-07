import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ExpenseList from '../ExpenseList';
import SavingList from '../SavingList';
import EditExpenseModal from '../components/EditExpenseModal';
import EditSavingModal from '../components/EditSavingModal';
import AutocompleteInput from '../components/AutocompleteInput';
import {
  addExpenseOfflineFirst,
  updateExpenseOfflineFirst,
  deleteExpenseOfflineFirst,
  fetchExpensesOfflineFirst,
  fetchCategoriesOfflineFirst,
  fetchExpenseSuggestionsOfflineFirst,
  addSavingOfflineFirst,
  updateSavingOfflineFirst,
  deleteSavingOfflineFirst,
  fetchSavingsOfflineFirst,
  fetchSavingCategoriesOfflineFirst,
  fetchSavingSuggestionsOfflineFirst,
  subscribeToSyncState,
  getTodayLocalDate,
} from '../offlineSync';

export default function AddExpensePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab State: 'expense' | 'saving'
  const initialTab = searchParams.get('tab') === 'saving' ? 'saving' : 'expense';
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // Keep state synced if URL changes
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'saving' && activeTab !== 'saving') {
      setActiveTab('saving');
    } else if ((!tabParam || tabParam === 'expense') && activeTab !== 'expense') {
      setActiveTab('expense');
    }
  }, [searchParams]);

  // Current month & year details
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();
  const currentMonthName = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  // ── Expense States ──
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);

  // Grand total of current month expenses
  const grandTotal = useMemo(
    () => items.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0),
    [items]
  );

  // ── Saving States ──
  const [savingItems, setSavingItems] = useState([]);
  const [savingCategories, setSavingCategories] = useState([]);
  const [savingListLoading, setSavingListLoading] = useState(true);

  const [savingName, setSavingName] = useState('');
  const [savingCategoryId, setSavingCategoryId] = useState('');
  const [savingAmount, setSavingAmount] = useState('');
  const [savingDate, setSavingDate] = useState('');
  const [savingLoading, setSavingLoading] = useState(false);
  const [savingSuccess, setSavingSuccess] = useState(false);
  const [savingError, setSavingError] = useState('');
  const [savingOfflineSaved, setSavingOfflineSaved] = useState(false);
  const [editingSaving, setEditingSaving] = useState(null);

  // Grand total of current month savings
  const savingGrandTotal = useMemo(
    () => savingItems.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0),
    [savingItems]
  );

  // ── Fetch Categories (Offline-First) ──
  useEffect(() => {
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

    fetchSavingCategoriesOfflineFirst()
      .then((data) => {
        if (Array.isArray(data)) {
          setSavingCategories(data);
        }
      })
      .catch((err) => console.error('Error fetching saving categories:', err));
  }, []);

  // ── Fetch Current Month Expenses (Offline-First) ──
  const fetchCurrentMonthExpenses = useCallback(async () => {
    setListLoading(true);
    try {
      const data = await fetchExpensesOfflineFirst({ month: currentMonth, year: currentYear });
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching current month expenses:', err);
    } finally {
      setListLoading(false);
    }
  }, [currentMonth, currentYear]);

  // ── Fetch Current Month Savings (Offline-First) ──
  const fetchCurrentMonthSavings = useCallback(async () => {
    setSavingListLoading(true);
    try {
      const data = await fetchSavingsOfflineFirst({ month: currentMonth, year: currentYear });
      setSavingItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching current month savings:', err);
    } finally {
      setSavingListLoading(false);
    }
  }, [currentMonth, currentYear]);

  useEffect(() => {
    fetchCurrentMonthExpenses();
    fetchCurrentMonthSavings();
  }, [fetchCurrentMonthExpenses, fetchCurrentMonthSavings]);

  // Subscribe to automatic sync events
  useEffect(() => {
    const unsubscribe = subscribeToSyncState(() => {
      fetchCurrentMonthExpenses();
      fetchCurrentMonthSavings();
    });
    return unsubscribe;
  }, [fetchCurrentMonthExpenses, fetchCurrentMonthSavings]);

  // ── Expense Action Handlers ──
  const handleDeleteExpense = async (id) => {
    try {
      await deleteExpenseOfflineFirst(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error('Error deleting expense:', err);
    }
  };

  const handleSaveExpenseEdit = async (updated) => {
    try {
      const catObj = categories.find((c) => c.id === parseInt(updated.category_id, 10));
      await updateExpenseOfflineFirst(updated, catObj?.name);
      fetchCurrentMonthExpenses();
    } catch (err) {
      console.error('Error updating expense:', err);
      throw err;
    }
  };

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    if (!name || !price) return;
    setLoading(true);
    setError('');
    setSuccess(false);
    setOfflineSaved(false);

    try {
      const selectedCat = categories.find((c) => c.id === parseInt(categoryId, 10));
      const res = await addExpenseOfflineFirst(
        {
          title: name,
          amount: parseFloat(price),
          category_id: categoryId ? parseInt(categoryId, 10) : null,
          date: date || getTodayLocalDate(),
        },
        selectedCat?.name
      );

      setName('');
      setCategoryId('');
      setPrice('');
      setDate('');

      if (res.isOffline) {
        setOfflineSaved(true);
        setTimeout(() => setOfflineSaved(false), 5000);
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }

      fetchCurrentMonthExpenses();
    } catch (err) {
      console.error('Error saving expense:', err);
      setError('Failed to save expense.');
    } finally {
      setLoading(false);
    }
  };

  // ── Saving Action Handlers ──
  const handleDeleteSaving = async (id) => {
    try {
      await deleteSavingOfflineFirst(id);
      setSavingItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error('Error deleting saving:', err);
    }
  };

  const handleSaveSavingEdit = async (updated) => {
    try {
      const catObj = savingCategories.find((c) => c.id === parseInt(updated.category_id, 10));
      await updateSavingOfflineFirst(updated, catObj?.name);
      fetchCurrentMonthSavings();
    } catch (err) {
      console.error('Error updating saving:', err);
      throw err;
    }
  };

  const handleSavingSubmit = async (e) => {
    e.preventDefault();
    if (!savingName || !savingAmount) return;
    setSavingLoading(true);
    setSavingError('');
    setSavingSuccess(false);
    setSavingOfflineSaved(false);

    try {
      const selectedCat = savingCategories.find((c) => c.id === parseInt(savingCategoryId, 10));
      const res = await addSavingOfflineFirst(
        {
          title: savingName,
          amount: parseFloat(savingAmount),
          category_id: savingCategoryId ? parseInt(savingCategoryId, 10) : null,
          date: savingDate || getTodayLocalDate(),
        },
        selectedCat?.name
      );

      setSavingName('');
      setSavingCategoryId('');
      setSavingAmount('');
      setSavingDate('');

      if (res.isOffline) {
        setSavingOfflineSaved(true);
        setTimeout(() => setSavingOfflineSaved(false), 5000);
      } else {
        setSavingSuccess(true);
        setTimeout(() => setSavingSuccess(false), 3000);
      }

      fetchCurrentMonthSavings();
    } catch (err) {
      console.error('Error saving saving entry:', err);
      setSavingError('Failed to save saving record.');
    } finally {
      setSavingLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 px-3.5 py-4 sm:p-6 md:p-8 font-sans pb-24 sm:pb-8">
      <div className="max-w-2xl mx-auto space-y-6 sm:space-y-8">

        {/* Top-Level Add Card with Tabs */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 text-left">
          
          {/* Navigation Tabs (Expense vs Saving) */}
          <div className="flex p-1 bg-gray-100/90 rounded-xl mb-4 sm:mb-6 border border-gray-200/50">
            <button
              type="button"
              onClick={() => handleTabSwitch('expense')}
              className={`flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'expense'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <span>💸</span>
              <span>Expense</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch('saving')}
              className={`flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'saving'
                  ? 'bg-white text-emerald-600 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <span>💰</span>
              <span>Saving</span>
            </button>
          </div>

          {/* ═════════ TAB 1: ADD EXPENSE FORM ═════════ */}
          {activeTab === 'expense' && (
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 border-b pb-2 text-left">
                Add New Expense
              </h2>

              {/* Success Banner */}
              {success && (
                <div className="mb-4 px-3.5 py-2.5 sm:px-4 sm:py-3 bg-green-50 border border-green-300 text-green-700 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-2 text-left">
                  <span>✅ Expense saved successfully to database!</span>
                  <button
                    onClick={() => navigate('/expenses?tab=expense')}
                    className="text-green-700 underline font-semibold hover:text-green-900 shrink-0 cursor-pointer"
                  >
                    View List →
                  </button>
                </div>
              )}

              {/* Offline Saved Banner */}
              {offlineSaved && (
                <div className="mb-4 px-3.5 py-2.5 sm:px-4 sm:py-3 bg-amber-50 border border-amber-300 text-amber-800 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-2 text-left">
                  <span>⚡ Saved offline! Syncs automatically when online.</span>
                  <button
                    onClick={() => navigate('/expenses?tab=expense')}
                    className="text-amber-800 underline font-semibold hover:text-amber-950 shrink-0 cursor-pointer"
                  >
                    View List →
                  </button>
                </div>
              )}

              {/* Error Banner */}
              {error && (
                <div className="mb-4 px-3.5 py-2.5 sm:px-4 sm:py-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs sm:text-sm text-left">
                  {error}
                </div>
              )}

              <form onSubmit={handleExpenseSubmit} className="space-y-3.5 sm:space-y-4 text-left">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">

                  {/* Item Name with Autocomplete (Left Aligned) */}
                  <div className="text-left">
                    <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">
                      Item Name
                    </label>
                    <AutocompleteInput
                      value={name}
                      onChange={setName}
                      onSelect={(suggestion) => {
                        setName(suggestion.title);
                        if (suggestion.category_id) {
                          setCategoryId(String(suggestion.category_id));
                        }
                      }}
                      fetchSuggestions={fetchExpenseSuggestionsOfflineFirst}
                      placeholder="e.g. Lunch"
                      required
                      type="expense"
                      className="w-full px-3 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-base sm:text-sm text-left"
                    />
                  </div>

                  {/* Category Dropdown (Left Aligned) */}
                  <div className="text-left">
                    <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">
                      Category
                    </label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full px-3 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-base sm:text-sm bg-white text-left"
                    >
                      <option value="">Select Category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Price (Left Aligned) */}
                  <div className="text-left">
                    <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">
                      Price (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="e.g. 150"
                      required
                      className="w-full px-3 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-base sm:text-sm text-left"
                    />
                  </div>

                  {/* Date (Left Aligned) */}
                  <div className="text-left">
                    <div className="flex items-center justify-between mb-1 text-left">
                      <label className="block text-xs sm:text-sm font-medium text-gray-600 text-left">Date</label>
                      <span className="text-[11px] text-gray-400 font-normal">Optional (defaults to Today)</span>
                    </div>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full px-3 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-base sm:text-sm bg-white text-left"
                    />
                  </div>

                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-3 sm:mt-4 bg-blue-600 text-white font-semibold py-2.5 sm:py-3 px-4 rounded-xl hover:bg-blue-700 active:scale-98 transition duration-150 disabled:opacity-60 text-sm sm:text-base shadow-xs cursor-pointer"
                >
                  {loading ? 'Saving...' : 'Add Expense'}
                </button>
              </form>
            </div>
          )}

          {/* ═════════ TAB 2: ADD SAVING FORM ═════════ */}
          {activeTab === 'saving' && (
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 border-b pb-2 text-left">
                Add New Saving
              </h2>

              {/* Success Banner */}
              {savingSuccess && (
                <div className="mb-4 px-3.5 py-2.5 sm:px-4 sm:py-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-2 text-left">
                  <span>✅ Saving record added successfully to database!</span>
                  <button
                    onClick={() => navigate('/expenses?tab=saving')}
                    className="text-emerald-800 underline font-semibold hover:text-emerald-950 shrink-0 cursor-pointer"
                  >
                    View List →
                  </button>
                </div>
              )}

              {/* Offline Saved Banner */}
              {savingOfflineSaved && (
                <div className="mb-4 px-3.5 py-2.5 sm:px-4 sm:py-3 bg-amber-50 border border-amber-300 text-amber-800 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-2 text-left">
                  <span>⚡ Saved offline! Syncs automatically when online.</span>
                  <button
                    onClick={() => navigate('/expenses?tab=saving')}
                    className="text-amber-800 underline font-semibold hover:text-amber-950 shrink-0 cursor-pointer"
                  >
                    View List →
                  </button>
                </div>
              )}

              {/* Error Banner */}
              {savingError && (
                <div className="mb-4 px-3.5 py-2.5 sm:px-4 sm:py-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs sm:text-sm text-left">
                  {savingError}
                </div>
              )}

              <form onSubmit={handleSavingSubmit} className="space-y-3.5 sm:space-y-4 text-left">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">

                  {/* Saving Name / Asset with Autocomplete (Left Aligned) */}
                  <div className="text-left">
                    <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">
                      Saving / Investment Name
                    </label>
                    <AutocompleteInput
                      value={savingName}
                      onChange={setSavingName}
                      onSelect={(suggestion) => {
                        setSavingName(suggestion.title);
                        if (suggestion.category_id) {
                          setSavingCategoryId(String(suggestion.category_id));
                        }
                      }}
                      fetchSuggestions={fetchSavingSuggestionsOfflineFirst}
                      placeholder="e.g. HDFC Small Cap SIP, PPF Deposit"
                      required
                      type="saving"
                      className="w-full px-3 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-500 text-base sm:text-sm text-left"
                    />
                  </div>

                  {/* Category Dropdown (Left Aligned) */}
                  <div className="text-left">
                    <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">
                      Saving Category
                    </label>
                    <select
                      value={savingCategoryId}
                      onChange={(e) => setSavingCategoryId(e.target.value)}
                      className="w-full px-3 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-500 text-base sm:text-sm bg-white text-left"
                    >
                      <option value="">Select Saving Category</option>
                      {savingCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Amount (Left Aligned) */}
                  <div className="text-left">
                    <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">
                      Deposit / Amount (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={savingAmount}
                      onChange={(e) => setSavingAmount(e.target.value)}
                      placeholder="e.g. 5000"
                      required
                      className="w-full px-3 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-500 text-base sm:text-sm text-left"
                    />
                  </div>

                  {/* Date (Left Aligned) */}
                  <div className="text-left">
                    <div className="flex items-center justify-between mb-1 text-left">
                      <label className="block text-xs sm:text-sm font-medium text-gray-600 text-left">Date</label>
                      <span className="text-[11px] text-gray-400 font-normal">Optional (defaults to Today)</span>
                    </div>
                    <input
                      type="date"
                      value={savingDate}
                      onChange={(e) => setSavingDate(e.target.value)}
                      className="w-full px-3 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-500 text-base sm:text-sm bg-white text-left"
                    />
                  </div>

                </div>

                <button
                  type="submit"
                  disabled={savingLoading}
                  className="w-full mt-3 sm:mt-4 bg-emerald-600 text-white font-semibold py-2.5 sm:py-3 px-4 rounded-xl hover:bg-emerald-700 active:scale-98 transition duration-150 disabled:opacity-60 text-sm sm:text-base shadow-xs cursor-pointer"
                >
                  {savingLoading ? 'Saving...' : 'Add Saving'}
                </button>
              </form>
            </div>
          )}

        </div>

        {/* ═════════ RECENT EXPENSES SECTION ═════════ */}
        {activeTab === 'expense' && (
          <div className="text-left">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 mb-3 sm:mb-4 px-0.5 text-left">
              <div className="text-left">
                <h3 className="text-lg sm:text-xl font-bold text-gray-800 text-left">
                  Recent Expenses ({currentMonthName})
                </h3>
                <p className="text-xs text-gray-500 text-left">
                  Showing expenses recorded for this month only
                </p>
              </div>
              <button
                onClick={() => navigate('/expenses?tab=expense')}
                className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 font-semibold transition-colors mt-1 sm:mt-0 cursor-pointer text-left"
              >
                See All / Filter →
              </button>
            </div>

            {/* Summary Bar */}
            {!listLoading && (
              <div className="flex items-center justify-between mb-3 sm:mb-4 px-1 gap-2 text-left">
                <span className="text-xs sm:text-sm text-gray-500 font-medium text-left truncate flex-1 min-w-0 pr-1">
                  {items.length} {items.length !== 1 ? 'expenses' : 'expense'} ({currentMonthName})
                </span>
                <span className="font-bold text-sm sm:text-base md:text-lg text-red-600 whitespace-nowrap shrink-0">
                  Total: ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {listLoading ? (
              <div className="text-center py-10 text-gray-400 bg-white rounded-xl shadow-xs text-sm">
                Loading current month expenses...
              </div>
            ) : (
              <ExpenseList
                data={items}
                onDeleteExpense={handleDeleteExpense}
                onEditExpense={(item) => setEditingExpense(item)}
                hideTitle={true}
              />
            )}
          </div>
        )}

        {/* ═════════ RECENT SAVINGS SECTION ═════════ */}
        {activeTab === 'saving' && (
          <div className="text-left">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 mb-3 sm:mb-4 px-0.5 text-left">
              <div className="text-left">
                <h3 className="text-lg sm:text-xl font-bold text-gray-800 text-left">
                  Recent Savings ({currentMonthName})
                </h3>
                <p className="text-xs text-gray-500 text-left">
                  Showing savings recorded for this month only
                </p>
              </div>
              <button
                onClick={() => navigate('/expenses?tab=saving')}
                className="text-xs sm:text-sm text-emerald-600 hover:text-emerald-800 font-semibold transition-colors mt-1 sm:mt-0 cursor-pointer text-left"
              >
                See All / Filter →
              </button>
            </div>

            {/* Summary Bar */}
            {!savingListLoading && (
              <div className="flex items-center justify-between mb-3 sm:mb-4 px-1 gap-2 text-left">
                <span className="text-xs sm:text-sm text-gray-500 font-medium text-left truncate flex-1 min-w-0 pr-1">
                  {savingItems.length} {savingItems.length !== 1 ? 'savings' : 'saving'} ({currentMonthName})
                </span>
                <span className="font-bold text-sm sm:text-base md:text-lg text-emerald-600 whitespace-nowrap shrink-0">
                  Total Saved: ₹{savingGrandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {savingListLoading ? (
              <div className="text-center py-10 text-gray-400 bg-white rounded-xl shadow-xs text-sm">
                Loading current month savings...
              </div>
            ) : (
              <SavingList
                data={savingItems}
                onDeleteSaving={handleDeleteSaving}
                onEditSaving={(item) => setEditingSaving(item)}
                hideTitle={true}
              />
            )}
          </div>
        )}

        {/* Edit Expense Modal */}
        <EditExpenseModal
          expense={editingExpense}
          isOpen={!!editingExpense}
          onClose={() => setEditingExpense(null)}
          onSave={handleSaveExpenseEdit}
        />

        {/* Edit Saving Modal */}
        <EditSavingModal
          saving={editingSaving}
          isOpen={!!editingSaving}
          onClose={() => setEditingSaving(null)}
          onSave={handleSaveSavingEdit}
        />

      </div>
    </div>
  );
}
