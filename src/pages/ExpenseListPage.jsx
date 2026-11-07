import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import ExpenseList from '../ExpenseList';
import SavingList from '../SavingList';
import DatePickerInput from '../components/DatePickerInput';
import EditExpenseModal from '../components/EditExpenseModal';
import EditSavingModal from '../components/EditSavingModal';
import MultiSelectCategoryDropdown from '../components/MultiSelectCategoryDropdown';
import MultiSelectItemDropdown from '../components/MultiSelectItemDropdown';
import { API_URL, YEARS_URL, SAVINGS_URL, SAVINGS_YEARS_URL, authFetch } from '../api';
import {
  fetchExpensesOfflineFirst,
  fetchCategoriesOfflineFirst,
  fetchDistinctItemsOfflineFirst,
  updateExpenseOfflineFirst,
  deleteExpenseOfflineFirst,
  fetchSavingsOfflineFirst,
  fetchSavingCategoriesOfflineFirst,
  fetchDistinctSavingItemsOfflineFirst,
  updateSavingOfflineFirst,
  deleteSavingOfflineFirst,
  subscribeToSyncState,
} from '../offlineSync';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function ExpenseListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Active Tab: 'expense' | 'saving'
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam === 'saving' ? 'saving' : 'expense');

  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  useEffect(() => {
    const currentTab = searchParams.get('tab');
    if (currentTab === 'saving' && activeTab !== 'saving') {
      setActiveTab('saving');
    } else if ((!currentTab || currentTab === 'expense') && activeTab !== 'expense') {
      setActiveTab('expense');
    }
  }, [searchParams]);

  // Current month & year reference
  const now = new Date();
  const currentMonthStr = String(now.getMonth() + 1); // "1"–"12"
  const currentYearStr = String(now.getFullYear());   // e.g. "2026"

  // ══════════════════════════════════════════════════
  // ── EXPENSE FILTER & STATE ────────────────────────
  // ══════════════════════════════════════════════════
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [availableItems, setAvailableItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingExpense, setEditingExpense] = useState(null);

  const [filterMonth, setFilterMonth] = useState(currentMonthStr);
  const [filterYear, setFilterYear] = useState(currentYearStr);
  const [filterDate, setFilterDate] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [yearOptions, setYearOptions] = useState([currentYearStr]);

  // Fetch expense categories
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
  }, []);

  // Fetch distinct expense items based on selected categories
  useEffect(() => {
    fetchDistinctItemsOfflineFirst({ category_ids: selectedCategories })
      .then((data) => {
        setAvailableItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => console.error('Error fetching distinct items:', err));
  }, [selectedCategories]);

  // Reset selectedItems when category filter changes
  const prevCategoriesRef = useRef(selectedCategories);
  useEffect(() => {
    if (prevCategoriesRef.current !== selectedCategories) {
      setSelectedItems([]);
      prevCategoriesRef.current = selectedCategories;
    }
  }, [selectedCategories]);

  // Fetch distinct years for expenses
  useEffect(() => {
    authFetch(YEARS_URL)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const merged = Array.from(new Set([...data, currentYearStr])).sort((a, b) => b - a);
          setYearOptions(merged);
        }
      })
      .catch((err) => console.error('Error fetching years:', err));
  }, [currentYearStr]);

  const isExpenseDateFilterActive = Boolean(filterMonth || filterYear || filterDate);

  useEffect(() => {
    if (!filterMonth && !filterYear && !filterDate) {
      setSelectedCategories([]);
      setSelectedItems([]);
    }
  }, [filterMonth, filterYear, filterDate]);

  // Fetch expenses
  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchExpensesOfflineFirst({
        month: filterMonth,
        year: filterYear,
        date: filterDate,
        category_ids: selectedCategories,
        items: selectedItems,
      });
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching expenses:', err);
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterYear, filterDate, selectedCategories, selectedItems]);

  useEffect(() => {
    if (activeTab === 'expense') {
      fetchExpenses();
    }
  }, [activeTab, fetchExpenses]);

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
      await updateExpenseOfflineFirst(updated);
      fetchExpenses();
    } catch (err) {
      console.error('Error updating expense:', err);
      throw err;
    }
  };

  const handleMonthChange = (val) => { setFilterMonth(val); setFilterDate(''); };
  const handleYearChange  = (val) => { setFilterYear(val);  setFilterDate(''); };

  const datePickerEnabled = filterMonth !== '' && filterYear !== '';
  const hasExpenseFilter = Boolean(
    filterMonth ||
    filterYear ||
    filterDate ||
    selectedCategories.length > 0 ||
    selectedItems.length > 0
  );

  const clearExpenseFilters = () => {
    setFilterMonth('');
    setFilterYear('');
    setFilterDate('');
    setSelectedCategories([]);
    setSelectedItems([]);
  };

  const resetExpenseToCurrentMonth = () => {
    const d = new Date();
    setFilterMonth(String(d.getMonth() + 1));
    setFilterYear(String(d.getFullYear()));
    setFilterDate('');
    setSelectedCategories([]);
    setSelectedItems([]);
  };

  const expenseGrandTotal = useMemo(
    () => items.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0),
    [items]
  );

  // ══════════════════════════════════════════════════
  // ── SAVING FILTER & STATE ─────────────────────────
  // ══════════════════════════════════════════════════
  const [savingItems, setSavingItems] = useState([]);
  const [savingCategories, setSavingCategories] = useState([]);
  const [availableSavingItems, setAvailableSavingItems] = useState([]);
  const [savingLoading, setSavingLoading] = useState(true);
  const [editingSaving, setEditingSaving] = useState(null);

  const [savingFilterMonth, setSavingFilterMonth] = useState(currentMonthStr);
  const [savingFilterYear, setSavingFilterYear] = useState(currentYearStr);
  const [savingFilterDate, setSavingFilterDate] = useState('');
  const [savingSelectedCategories, setSavingSelectedCategories] = useState([]);
  const [savingSelectedItems, setSavingSelectedItems] = useState([]);
  const [savingYearOptions, setSavingYearOptions] = useState([currentYearStr]);

  // Fetch saving categories
  useEffect(() => {
    fetchSavingCategoriesOfflineFirst()
      .then((data) => {
        if (Array.isArray(data)) {
          setSavingCategories(data);
        }
      })
      .catch((err) => console.error('Error fetching saving categories:', err));
  }, []);

  // Fetch distinct saving items
  useEffect(() => {
    fetchDistinctSavingItemsOfflineFirst({ category_ids: savingSelectedCategories })
      .then((data) => {
        setAvailableSavingItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => console.error('Error fetching distinct saving items:', err));
  }, [savingSelectedCategories]);

  // Reset savingSelectedItems when category filter changes
  const prevSavingCategoriesRef = useRef(savingSelectedCategories);
  useEffect(() => {
    if (prevSavingCategoriesRef.current !== savingSelectedCategories) {
      setSavingSelectedItems([]);
      prevSavingCategoriesRef.current = savingSelectedCategories;
    }
  }, [savingSelectedCategories]);

  // Fetch distinct years for savings
  useEffect(() => {
    authFetch(SAVINGS_YEARS_URL)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const merged = Array.from(new Set([...data, currentYearStr])).sort((a, b) => b - a);
          setSavingYearOptions(merged);
        }
      })
      .catch((err) => console.error('Error fetching saving years:', err));
  }, [currentYearStr]);

  const isSavingDateFilterActive = Boolean(savingFilterMonth || savingFilterYear || savingFilterDate);

  useEffect(() => {
    if (!savingFilterMonth && !savingFilterYear && !savingFilterDate) {
      setSavingSelectedCategories([]);
      setSavingSelectedItems([]);
    }
  }, [savingFilterMonth, savingFilterYear, savingFilterDate]);

  // Fetch savings
  const fetchSavings = useCallback(async () => {
    setSavingLoading(true);
    try {
      const data = await fetchSavingsOfflineFirst({
        month: savingFilterMonth,
        year: savingFilterYear,
        date: savingFilterDate,
        category_ids: savingSelectedCategories,
        items: savingSelectedItems,
      });
      setSavingItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching savings:', err);
    } finally {
      setSavingLoading(false);
    }
  }, [savingFilterMonth, savingFilterYear, savingFilterDate, savingSelectedCategories, savingSelectedItems]);

  useEffect(() => {
    if (activeTab === 'saving') {
      fetchSavings();
    }
  }, [activeTab, fetchSavings]);

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
      await updateSavingOfflineFirst(updated);
      fetchSavings();
    } catch (err) {
      console.error('Error updating saving:', err);
      throw err;
    }
  };

  const handleSavingMonthChange = (val) => { setSavingFilterMonth(val); setSavingFilterDate(''); };
  const handleSavingYearChange  = (val) => { setSavingFilterYear(val);  setSavingFilterDate(''); };

  const savingDatePickerEnabled = savingFilterMonth !== '' && savingFilterYear !== '';
  const hasSavingFilter = Boolean(
    savingFilterMonth ||
    savingFilterYear ||
    savingFilterDate ||
    savingSelectedCategories.length > 0 ||
    savingSelectedItems.length > 0
  );

  const clearSavingFilters = () => {
    setSavingFilterMonth('');
    setSavingFilterYear('');
    setSavingFilterDate('');
    setSavingSelectedCategories([]);
    setSavingSelectedItems([]);
  };

  const resetSavingToCurrentMonth = () => {
    const d = new Date();
    setSavingFilterMonth(String(d.getMonth() + 1));
    setSavingFilterYear(String(d.getFullYear()));
    setSavingFilterDate('');
    setSavingSelectedCategories([]);
    setSavingSelectedItems([]);
  };

  const savingGrandTotal = useMemo(
    () => savingItems.reduce((sum, i) => sum + parseFloat(i.amount || 0), 0),
    [savingItems]
  );

  // Sync listener
  useEffect(() => {
    const unsubscribe = subscribeToSyncState(() => {
      if (activeTab === 'expense') fetchExpenses();
      else fetchSavings();
    });
    return unsubscribe;
  }, [activeTab, fetchExpenses, fetchSavings]);

  return (
    <div className="min-h-screen bg-gray-100 px-3.5 py-4 sm:p-6 md:p-8 font-sans pb-24 sm:pb-8">
      <div className="max-w-2xl mx-auto">

        {/* ── Top Tabs (Expense vs Saving) ── */}
        <div className="flex p-1 bg-white rounded-2xl shadow-xs border border-gray-100 mb-4 sm:mb-6">
          <button
            type="button"
            onClick={() => handleTabSwitch('expense')}
            className={`flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'expense'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <span>💸</span>
            <span>Expenses</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabSwitch('saving')}
            className={`flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'saving'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <span>💰</span>
            <span>Savings</span>
          </button>
        </div>

        {/* ══════════════════════════════════════════════════
            ── TAB 1: EXPENSES VIEW
            ══════════════════════════════════════════════════ */}
        {activeTab === 'expense' && (
          <div>
            {/* Filter Card */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-100 mb-4 sm:mb-6 text-left">
              <div className="flex items-center justify-between mb-3 sm:mb-4 text-left">
                <h2 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-1.5 text-left">
                  <span>🔍</span> Filter Expenses
                </h2>
                <div className="flex items-center gap-2">
                  {hasExpenseFilter && (
                    <button
                      onClick={clearExpenseFilters}
                      className="text-xs sm:text-sm text-red-500 hover:text-red-700 font-semibold transition-colors cursor-pointer"
                      title="View all expenses across all years"
                    >
                      ✕ Show All
                    </button>
                  )}
                  {(!filterMonth || !filterYear) && (
                    <button
                      onClick={resetExpenseToCurrentMonth}
                      className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 font-semibold transition-colors cursor-pointer"
                    >
                      📅 Current Month
                    </button>
                  )}
                </div>
              </div>

              {/* Month + Year */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-4 text-left">
                <div className="text-left">
                  <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">Month</label>
                  <select
                    value={filterMonth}
                    onChange={(e) => handleMonthChange(e.target.value)}
                    className="w-full px-2.5 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-base sm:text-sm bg-white text-left"
                  >
                    <option value="">All Months</option>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={String(i + 1)}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="text-left">
                  <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">Year</label>
                  <select
                    value={filterYear}
                    onChange={(e) => handleYearChange(e.target.value)}
                    className="w-full px-2.5 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-base sm:text-sm bg-white text-left"
                  >
                    <option value="">All Years</option>
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Categories Multi-Select + Specific Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4 mt-3 sm:mt-4 text-left">
                <div className="text-left">
                  <div className="flex items-center justify-between mb-1 text-left">
                    <label
                      className={`block text-xs sm:text-sm font-medium text-left ${
                        isExpenseDateFilterActive ? 'text-gray-600' : 'text-gray-400'
                      }`}
                    >
                      Categories
                    </label>
                    {!isExpenseDateFilterActive && (
                      <span className="text-[11px] text-gray-400 font-normal">
                        (Requires date filter)
                      </span>
                    )}
                  </div>
                  <MultiSelectCategoryDropdown
                    categories={categories}
                    selectedIds={selectedCategories}
                    onChange={setSelectedCategories}
                    disabled={!isExpenseDateFilterActive}
                  />
                </div>

                <div className="text-left">
                  <div className="flex items-center justify-between mb-1 text-left">
                    <label
                      className={`block text-xs sm:text-sm font-medium text-left ${
                        datePickerEnabled ? 'text-gray-600' : 'text-gray-400'
                      }`}
                    >
                      Specific Date
                    </label>
                    {!datePickerEnabled && (
                      <span className="text-[11px] text-gray-400 font-normal">
                        (Requires month & year)
                      </span>
                    )}
                  </div>
                  <DatePickerInput
                    year={parseInt(filterYear) || currentYearStr}
                    month={parseInt(filterMonth) || currentMonthStr}
                    selected={filterDate}
                    onSelect={setFilterDate}
                    disabled={!datePickerEnabled}
                  />
                </div>
              </div>

              {/* Items / Products Multi-Select Dropdown */}
              <div className="mt-3 sm:mt-4 text-left">
                <div className="flex items-center justify-between mb-1 text-left">
                  <label
                    className={`block text-xs sm:text-sm font-medium text-left ${
                      isExpenseDateFilterActive ? 'text-gray-600' : 'text-gray-400'
                    }`}
                  >
                    Items / Products
                  </label>
                  {!isExpenseDateFilterActive ? (
                    <span className="text-[11px] text-gray-400 font-normal">
                      (Requires date filter)
                    </span>
                  ) : selectedCategories.length > 0 ? (
                    <span className="text-[11px] text-blue-600 font-normal">
                      ({availableItems.length} items from selected categor{selectedCategories.length > 1 ? 'ies' : 'y'})
                    </span>
                  ) : null}
                </div>
                <MultiSelectItemDropdown
                  items={availableItems}
                  selectedTitles={selectedItems}
                  onChange={setSelectedItems}
                  disabled={!isExpenseDateFilterActive}
                />
              </div>

              {/* Active filter pills */}
              {hasExpenseFilter && (
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-3 pt-3 border-t border-gray-100 text-left">
                  {filterMonth && (
                    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full font-medium">
                      Month: {MONTHS[parseInt(filterMonth) - 1]}
                      <button onClick={() => handleMonthChange('')} className="hover:text-blue-900 ml-1">✕</button>
                    </span>
                  )}
                  {filterYear && (
                    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full font-medium">
                      Year: {filterYear}
                      <button onClick={() => handleYearChange('')} className="hover:text-blue-900 ml-1">✕</button>
                    </span>
                  )}
                  {filterDate && (
                    <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full font-medium">
                      Date: {new Date(filterDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      <button onClick={() => setFilterDate('')} className="hover:text-blue-900 ml-1">✕</button>
                    </span>
                  )}
                  {selectedCategories.length > 0 &&
                    selectedCategories.map((catId) => {
                      const cat = categories.find((c) => c.id === catId);
                      if (!cat) return null;
                      return (
                        <span
                          key={catId}
                          className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs px-2.5 py-1 rounded-full font-medium border border-indigo-100"
                        >
                          🏷️ {cat.name}
                          <button
                            onClick={() =>
                              setSelectedCategories((prev) => prev.filter((id) => id !== catId))
                            }
                            className="hover:text-indigo-950 ml-1 font-bold"
                          >
                            ✕
                          </button>
                        </span>
                      );
                    })}
                  {selectedItems.length > 0 &&
                    selectedItems.map((itemTitle) => (
                      <span
                        key={itemTitle}
                        className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs px-2.5 py-1 rounded-full font-medium border border-emerald-100"
                      >
                        📦 {itemTitle}
                        <button
                          onClick={() =>
                            setSelectedItems((prev) => prev.filter((t) => t !== itemTitle))
                          }
                          className="hover:text-emerald-950 ml-1 font-bold"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                </div>
              )}
            </div>

            {/* Summary bar */}
            {!loading && (
              <div className="flex items-center justify-between mb-3 sm:mb-4 px-1 gap-2 text-left">
                <span className="text-xs sm:text-sm text-gray-500 font-medium text-left truncate flex-1 min-w-0 pr-1">
                  {items.length} {items.length !== 1 ? 'expenses' : 'expense'}
                  {filterMonth && filterYear
                    ? ` (${MONTHS[parseInt(filterMonth) - 1]} ${filterYear})`
                    : hasExpenseFilter
                    ? ' (filtered)'
                    : ' (all time)'}
                  {selectedCategories.length > 0
                    ? ` • ${selectedCategories.length} categor${selectedCategories.length > 1 ? 'ies' : 'y'}`
                    : ''}
                  {selectedItems.length > 0
                    ? ` • ${selectedItems.length} item${selectedItems.length > 1 ? 's' : ''}`
                    : ''}
                </span>
                <span className="font-bold text-sm sm:text-base md:text-lg text-red-600 whitespace-nowrap shrink-0">
                  Total: ₹{expenseGrandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* Expense List */}
            {loading ? (
              <div className="text-center py-16 text-gray-400 bg-white rounded-xl shadow-xs text-sm">
                Loading expenses...
              </div>
            ) : (
              <ExpenseList
                data={items}
                onDeleteExpense={handleDeleteExpense}
                onEditExpense={(item) => setEditingExpense(item)}
              />
            )}

            {/* Edit Expense Modal */}
            <EditExpenseModal
              expense={editingExpense}
              isOpen={!!editingExpense}
              onClose={() => setEditingExpense(null)}
              onSave={handleSaveExpenseEdit}
            />
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            ── TAB 2: SAVINGS VIEW
            ══════════════════════════════════════════════════ */}
        {activeTab === 'saving' && (
          <div>
            {/* Filter Card */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-100 mb-4 sm:mb-6 text-left">
              <div className="flex items-center justify-between mb-3 sm:mb-4 text-left">
                <h2 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-1.5 text-left">
                  <span>💰</span> Filter Savings
                </h2>
                <div className="flex items-center gap-2">
                  {hasSavingFilter && (
                    <button
                      onClick={clearSavingFilters}
                      className="text-xs sm:text-sm text-red-500 hover:text-red-700 font-semibold transition-colors cursor-pointer"
                      title="View all savings across all years"
                    >
                      ✕ Show All
                    </button>
                  )}
                  {(!savingFilterMonth || !savingFilterYear) && (
                    <button
                      onClick={resetSavingToCurrentMonth}
                      className="text-xs sm:text-sm text-emerald-600 hover:text-emerald-800 font-semibold transition-colors cursor-pointer"
                    >
                      📅 Current Month
                    </button>
                  )}
                </div>
              </div>

              {/* Month + Year */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-4 text-left">
                <div className="text-left">
                  <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">Month</label>
                  <select
                    value={savingFilterMonth}
                    onChange={(e) => handleSavingMonthChange(e.target.value)}
                    className="w-full px-2.5 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-500 text-base sm:text-sm bg-white text-left"
                  >
                    <option value="">All Months</option>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={String(i + 1)}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="text-left">
                  <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">Year</label>
                  <select
                    value={savingFilterYear}
                    onChange={(e) => handleSavingYearChange(e.target.value)}
                    className="w-full px-2.5 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-emerald-500 text-base sm:text-sm bg-white text-left"
                  >
                    <option value="">All Years</option>
                    {savingYearOptions.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Saving Categories Multi-Select + Specific Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4 mt-3 sm:mt-4 text-left">
                <div className="text-left">
                  <div className="flex items-center justify-between mb-1 text-left">
                    <label
                      className={`block text-xs sm:text-sm font-medium text-left ${
                        isSavingDateFilterActive ? 'text-gray-600' : 'text-gray-400'
                      }`}
                    >
                      Saving Categories
                    </label>
                    {!isSavingDateFilterActive && (
                      <span className="text-[11px] text-gray-400 font-normal">
                        (Requires date filter)
                      </span>
                    )}
                  </div>
                  <MultiSelectCategoryDropdown
                    categories={savingCategories}
                    selectedIds={savingSelectedCategories}
                    onChange={setSavingSelectedCategories}
                    disabled={!isSavingDateFilterActive}
                  />
                </div>

                <div className="text-left">
                  <div className="flex items-center justify-between mb-1 text-left">
                    <label
                      className={`block text-xs sm:text-sm font-medium text-left ${
                        savingDatePickerEnabled ? 'text-gray-600' : 'text-gray-400'
                      }`}
                    >
                      Specific Date
                    </label>
                    {!savingDatePickerEnabled && (
                      <span className="text-[11px] text-gray-400 font-normal">
                        (Requires month & year)
                      </span>
                    )}
                  </div>
                  <DatePickerInput
                    year={parseInt(savingFilterYear) || currentYearStr}
                    month={parseInt(savingFilterMonth) || currentMonthStr}
                    selected={savingFilterDate}
                    onSelect={setSavingFilterDate}
                    disabled={!savingDatePickerEnabled}
                  />
                </div>
              </div>

              {/* Saving Items / Investments Multi-Select Dropdown */}
              <div className="mt-3 sm:mt-4 text-left">
                <div className="flex items-center justify-between mb-1 text-left">
                  <label
                    className={`block text-xs sm:text-sm font-medium text-left ${
                      isSavingDateFilterActive ? 'text-gray-600' : 'text-gray-400'
                    }`}
                  >
                    Saving / Asset Items
                  </label>
                  {!isSavingDateFilterActive ? (
                    <span className="text-[11px] text-gray-400 font-normal">
                      (Requires date filter)
                    </span>
                  ) : savingSelectedCategories.length > 0 ? (
                    <span className="text-[11px] text-emerald-600 font-normal">
                      ({availableSavingItems.length} assets from selected categor{savingSelectedCategories.length > 1 ? 'ies' : 'y'})
                    </span>
                  ) : null}
                </div>
                <MultiSelectItemDropdown
                  items={availableSavingItems}
                  selectedTitles={savingSelectedItems}
                  onChange={setSavingSelectedItems}
                  disabled={!isSavingDateFilterActive}
                />
              </div>

              {/* Active filter pills */}
              {hasSavingFilter && (
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-3 pt-3 border-t border-gray-100 text-left">
                  {savingFilterMonth && (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-medium border border-emerald-200">
                      Month: {MONTHS[parseInt(savingFilterMonth) - 1]}
                      <button onClick={() => handleSavingMonthChange('')} className="hover:text-emerald-950 ml-1">✕</button>
                    </span>
                  )}
                  {savingFilterYear && (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-medium border border-emerald-200">
                      Year: {savingFilterYear}
                      <button onClick={() => handleSavingYearChange('')} className="hover:text-emerald-950 ml-1">✕</button>
                    </span>
                  )}
                  {savingFilterDate && (
                    <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-medium border border-emerald-200">
                      Date: {new Date(savingFilterDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      <button onClick={() => setSavingFilterDate('')} className="hover:text-emerald-950 ml-1">✕</button>
                    </span>
                  )}
                  {savingSelectedCategories.length > 0 &&
                    savingSelectedCategories.map((catId) => {
                      const cat = savingCategories.find((c) => c.id === catId);
                      if (!cat) return null;
                      return (
                        <span
                          key={catId}
                          className="inline-flex items-center gap-1 bg-teal-50 text-teal-800 text-xs px-2.5 py-1 rounded-full font-medium border border-teal-200"
                        >
                          🏷️ {cat.name}
                          <button
                            onClick={() =>
                              setSavingSelectedCategories((prev) => prev.filter((id) => id !== catId))
                            }
                            className="hover:text-teal-950 ml-1 font-bold"
                          >
                            ✕
                          </button>
                        </span>
                      );
                    })}
                  {savingSelectedItems.length > 0 &&
                    savingSelectedItems.map((itemTitle) => (
                      <span
                        key={itemTitle}
                        className="inline-flex items-center gap-1 bg-green-50 text-green-800 text-xs px-2.5 py-1 rounded-full font-medium border border-green-200"
                      >
                        💰 {itemTitle}
                        <button
                          onClick={() =>
                            setSavingSelectedItems((prev) => prev.filter((t) => t !== itemTitle))
                          }
                          className="hover:text-green-950 ml-1 font-bold"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                </div>
              )}
            </div>

            {/* Summary bar */}
            {!savingLoading && (
              <div className="flex items-center justify-between mb-3 sm:mb-4 px-1 gap-2 text-left">
                <span className="text-xs sm:text-sm text-gray-500 font-medium text-left truncate flex-1 min-w-0 pr-1">
                  {savingItems.length} {savingItems.length !== 1 ? 'deposits' : 'deposit'}
                  {savingFilterMonth && savingFilterYear
                    ? ` (${MONTHS[parseInt(savingFilterMonth) - 1]} ${savingFilterYear})`
                    : hasSavingFilter
                    ? ' (filtered)'
                    : ' (all time)'}
                  {savingSelectedCategories.length > 0
                    ? ` • ${savingSelectedCategories.length} categor${savingSelectedCategories.length > 1 ? 'ies' : 'y'}`
                    : ''}
                  {savingSelectedItems.length > 0
                    ? ` • ${savingSelectedItems.length} asset${savingSelectedItems.length > 1 ? 's' : ''}`
                    : ''}
                </span>
                <span className="font-bold text-sm sm:text-base md:text-lg text-emerald-600 whitespace-nowrap shrink-0">
                  Total Saved: ₹{savingGrandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* Saving List */}
            {savingLoading ? (
              <div className="text-center py-16 text-gray-400 bg-white rounded-xl shadow-xs text-sm">
                Loading savings...
              </div>
            ) : (
              <SavingList
                data={savingItems}
                onDeleteSaving={handleDeleteSaving}
                onEditSaving={(item) => setEditingSaving(item)}
              />
            )}

            {/* Edit Saving Modal */}
            <EditSavingModal
              saving={editingSaving}
              isOpen={!!editingSaving}
              onClose={() => setEditingSaving(null)}
              onSave={handleSaveSavingEdit}
            />
          </div>
        )}

      </div>
    </div>
  );
}
