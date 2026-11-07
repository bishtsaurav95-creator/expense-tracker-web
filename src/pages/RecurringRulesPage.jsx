import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RECURRING_URL, authFetch } from '../api';
import {
  fetchCategoriesOfflineFirst,
  fetchSavingCategoriesOfflineFirst,
  fetchExpenseSuggestionsOfflineFirst,
  fetchSavingSuggestionsOfflineFirst,
  getTodayLocalDate,
} from '../offlineSync';
import AutocompleteInput from '../components/AutocompleteInput';
import { useToast } from '../context/ToastContext';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export default function RecurringRulesPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
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

  const [rules, setRules] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [savingCategories, setSavingCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingDue, setProcessingDue] = useState(false);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  // Form inputs
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [frequency, setFrequency] = useState('monthly'); // 'daily', 'weekly', 'monthly'
  const [startDate, setStartDate] = useState(getTodayLocalDate());
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState(5);
  const [dayOfWeek, setDayOfWeek] = useState(1); // Monday

  // Delete modal state
  const [ruleToDelete, setRuleToDelete] = useState(null);

  // Fetch categories (offline-first)
  useEffect(() => {
    fetchCategoriesOfflineFirst()
      .then((data) => {
        if (Array.isArray(data)) {
          const sorted = [...data].sort((a, b) => {
            if (a.name.toLowerCase() === 'other') return 1;
            if (b.name.toLowerCase() === 'other') return -1;
            return a.name.localeCompare(b.name);
          });
          setExpenseCategories(sorted);
        }
      })
      .catch((err) => console.error('Failed to load expense categories:', err));

    fetchSavingCategoriesOfflineFirst()
      .then((data) => {
        if (Array.isArray(data)) {
          setSavingCategories(data);
        }
      })
      .catch((err) => console.error('Failed to load saving categories:', err));
  }, []);

  // Fetch all rules
  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(RECURRING_URL);
      if (res.ok) {
        const data = await res.json();
        setRules(Array.isArray(data) ? data : []);
      } else {
        console.warn('Failed to fetch recurring rules');
      }
    } catch (err) {
      console.error('Error fetching recurring rules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  // Current tab rules
  const currentRules = useMemo(() => {
    return rules.filter((r) => (r.rule_type || 'expense') === activeTab);
  }, [rules, activeTab]);

  // Active categories for the current tab
  const currentCategories = activeTab === 'saving' ? savingCategories : expenseCategories;

  // Manual Catch-up
  const handleProcessDue = async () => {
    setProcessingDue(true);
    try {
      const res = await authFetch(`${RECURRING_URL}/process-due`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.summary) {
        const count = data.summary.generatedPaymentsCount || data.summary.generatedExpensesCount || 0;
        if (count > 0) {
          showToast(`⚡ Generated ${count} missing/due payment(s)!`, 'success');
        } else {
          showToast('✅ All recurring payments are already up to date!', 'info');
        }
        fetchRules();
      } else {
        showToast(data.error || 'Failed to process recurring payments.', 'error');
      }
    } catch (err) {
      showToast('Error connecting to backend.', 'error');
    } finally {
      setProcessingDue(false);
    }
  };

  // Toggle active / paused
  const handleToggleActive = async (ruleId) => {
    try {
      const res = await authFetch(`${RECURRING_URL}/${ruleId}/toggle`, { method: 'PATCH' });
      if (res.ok) {
        setRules((prev) =>
          prev.map((r) => (r.id === ruleId ? { ...r, is_active: r.is_active ? 0 : 1 } : r))
        );
        showToast('Rule status updated.', 'success');
      } else {
        showToast('Failed to toggle rule.', 'error');
      }
    } catch (err) {
      showToast('Connection error.', 'error');
    }
  };

  // Open modal for Create
  const handleOpenCreateModal = () => {
    setEditingRuleId(null);
    setTitle('');
    setAmount('');
    setCategoryId('');
    setFrequency('monthly');
    setStartDate(getTodayLocalDate());
    setHasEndDate(false);
    setEndDate('');
    setDayOfMonth(5);
    setDayOfWeek(1);
    setModalError('');
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEditModal = (rule) => {
    setEditingRuleId(rule.id);
    setTitle(rule.title || '');
    setAmount(rule.amount ? String(rule.amount) : '');
    setCategoryId(rule.category_id ? String(rule.category_id) : '');
    setFrequency(rule.frequency || 'monthly');
    setStartDate(rule.start_date || getTodayLocalDate());
    setHasEndDate(!!rule.end_date);
    setEndDate(rule.end_date || '');
    setDayOfMonth(rule.day_of_month || 5);
    setDayOfWeek(rule.day_of_week != null ? rule.day_of_week : 1);
    setModalError('');
    setIsModalOpen(true);
  };

  // Save Rule
  const handleSubmitRule = async (e) => {
    e.preventDefault();
    if (!title.trim() || !amount) {
      setModalError('Title and amount are required.');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setModalError('Amount must be a valid positive number.');
      return;
    }

    setModalLoading(true);
    setModalError('');

    const payload = {
      rule_type: activeTab,
      title: title.trim(),
      amount: numAmount,
      category_id: categoryId ? parseInt(categoryId, 10) : null,
      frequency,
      start_date: startDate || getTodayLocalDate(),
      end_date: hasEndDate && endDate ? endDate : null,
      day_of_month: frequency === 'monthly' ? parseInt(dayOfMonth, 10) : null,
      day_of_week: frequency === 'weekly' ? parseInt(dayOfWeek, 10) : null,
    };

    try {
      const url = editingRuleId ? `${RECURRING_URL}/${editingRuleId}` : RECURRING_URL;
      const method = editingRuleId ? 'PUT' : 'POST';

      const res = await authFetch(url, {
        method,
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        setIsModalOpen(false);
        const catchUpCount = data.catchUpSummary?.generatedPaymentsCount || data.catchUpSummary?.generatedExpensesCount || 0;
        if (catchUpCount > 0) {
          showToast(
            `Rule saved! Auto-added ${catchUpCount} past due ${activeTab === 'saving' ? 'saving(s)' : 'expense(s)'} up to today.`,
            'success'
          );
        } else {
          showToast(
            editingRuleId ? 'Recurring rule updated successfully.' : 'Recurring rule created successfully.',
            'success'
          );
        }
        fetchRules();
      } else {
        setModalError(data.error || 'Failed to save rule.');
      }
    } catch (err) {
      setModalError('Network error while saving recurring rule.');
    } finally {
      setModalLoading(false);
    }
  };

  // Confirm delete
  const handleDeleteRule = async () => {
    if (!ruleToDelete) return;
    try {
      const res = await authFetch(`${RECURRING_URL}/${ruleToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        setRules((prev) => prev.filter((r) => r.id !== ruleToDelete.id));
        showToast('Recurring rule deleted.', 'info');
      } else {
        showToast('Failed to delete rule.', 'error');
      }
    } catch (err) {
      showToast('Error deleting rule.', 'error');
    } finally {
      setRuleToDelete(null);
    }
  };

  // Summary Metrics for current tab
  const activeRulesCount = useMemo(
    () => currentRules.filter((r) => r.is_active).length,
    [currentRules]
  );

  const estimatedMonthlyTotal = useMemo(() => {
    return currentRules
      .filter((r) => r.is_active)
      .reduce((sum, r) => {
        const amt = parseFloat(r.amount || 0);
        if (r.frequency === 'daily') return sum + amt * 30;
        if (r.frequency === 'weekly') return sum + amt * 4.33;
        return sum + amt; // monthly
      }, 0);
  }, [currentRules]);

  const earliestNextDue = useMemo(() => {
    const activeWithNext = currentRules
      .filter((r) => r.is_active && r.next_run_date)
      .map((r) => r.next_run_date)
      .sort();
    return activeWithNext.length > 0 ? activeWithNext[0] : null;
  }, [currentRules]);

  return (
    <div className="min-h-screen bg-gray-100 px-3.5 py-4 sm:p-6 md:p-8 font-sans pb-24 sm:pb-8 text-left">
      <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6">

        {/* ── Top Tabs (Recurring Expenses vs Recurring Savings) ── */}
        <div className="flex p-1 bg-white rounded-2xl shadow-xs border border-gray-100 mb-2 sm:mb-4">
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
            <span><span className="hidden sm:inline">Recurring </span>Expenses</span>
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
            <span><span className="hidden sm:inline">Recurring </span>Savings</span>
          </button>
        </div>

        {/* ── Page Header Card ────────────────────────────────────── */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-100 text-left">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-left">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-1.5 text-left">
                <span>{activeTab === 'saving' ? '💰' : '🔄'}</span>
                <span>{activeTab === 'saving' ? 'Recurring Savings & SIPs' : 'Recurring Expenses'}</span>
              </h2>
              <p className="text-xs text-gray-500 mt-0.5 text-left">
                {activeTab === 'saving'
                  ? 'Automate monthly SIPs, PPF deposits & insurance premiums into Savings table.'
                  : 'Automate rent, bills & daily payments into Expenses table. Server downtime auto-caught up.'}
              </p>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
              <button
                onClick={handleProcessDue}
                disabled={processingDue}
                title="Check and catch up on any due payments right now"
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 transition-colors shadow-2xs active:scale-95 disabled:opacity-60 cursor-pointer"
              >
                <span className={processingDue ? 'animate-spin inline-block' : ''}>⚡</span>
                <span>{processingDue ? 'Processing...' : 'Run Catch-Up'}</span>
              </button>

              <button
                onClick={handleOpenCreateModal}
                className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold text-white transition-all shadow-sm active:scale-95 cursor-pointer ${
                  activeTab === 'saving' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <span>➕</span>
                <span>Add {activeTab === 'saving' ? 'Saving Rule' : 'Expense Rule'}</span>
              </button>
            </div>
          </div>

          {/* ── Summary Stats Cards ────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mt-3.5 pt-3 border-t border-gray-100 text-left">
            
            <div className={`${activeTab === 'saving' ? 'bg-emerald-50/50 border-emerald-100/70' : 'bg-blue-50/50 border-blue-100/70'} border rounded-xl p-2.5 sm:p-3 text-left`}>
              <span className={`text-[10px] sm:text-[11px] font-semibold block uppercase tracking-wider ${activeTab === 'saving' ? 'text-emerald-700' : 'text-blue-700'}`}>
                {activeTab === 'saving' ? 'Active Auto-SIPs' : 'Active Auto-Pay'}
              </span>
              <div className="flex items-baseline gap-1 mt-0.5 text-left">
                <span className={`text-lg sm:text-xl font-bold ${activeTab === 'saving' ? 'text-emerald-900' : 'text-blue-900'}`}>
                  {activeRulesCount}
                </span>
                <span className={`text-[11px] ${activeTab === 'saving' ? 'text-emerald-600' : 'text-blue-600'}`}>
                  of {currentRules.length}
                </span>
              </div>
            </div>

            <div className="bg-emerald-50/50 border border-emerald-100/70 rounded-xl p-2.5 sm:p-3 text-left">
              <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-700 block uppercase tracking-wider text-left">
                {activeTab === 'saving' ? 'Est. Monthly Saving' : 'Est. Monthly Expense'}
              </span>
              <div className="flex items-baseline gap-1 mt-0.5 text-left">
                <span className="text-lg sm:text-xl font-bold text-emerald-800">
                  ₹{estimatedMonthlyTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
                <span className="text-[11px] text-emerald-600">/mo</span>
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 bg-purple-50/50 border border-purple-100/70 rounded-xl p-2.5 sm:p-3 text-left">
              <span className="text-[10px] sm:text-[11px] font-semibold text-purple-700 block uppercase tracking-wider text-left">
                Next Upcoming
              </span>
              <div className="mt-0.5 text-left">
                <span className="text-sm sm:text-base font-bold text-purple-900 block truncate text-left">
                  {earliestNextDue
                    ? new Date(earliestNextDue + 'T00:00:00').toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'None Scheduled'}
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* ── Rules List Section ──────────────────────────────────── */}
        <div className="text-left">
          <div className="flex items-center justify-between mb-2.5 px-1 text-left">
            <h3 className="text-xs sm:text-sm font-bold text-gray-700 text-left">
              {activeTab === 'saving' ? 'Configured Saving Rules' : 'Configured Expense Rules'} ({currentRules.length})
            </h3>
            <button
              onClick={() => navigate(activeTab === 'saving' ? '/expenses?tab=saving' : '/expenses?tab=expense')}
              className={`text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'saving' ? 'text-emerald-600 hover:text-emerald-800' : 'text-blue-600 hover:text-blue-800'
              }`}
            >
              {activeTab === 'saving' ? 'View Savings List →' : 'View Expenses List →'}
            </button>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm shadow-xs border border-gray-100">
              Loading recurring rules...
            </div>
          ) : currentRules.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 sm:p-10 text-center text-gray-500 shadow-xs border border-gray-100">
              <span className="text-3xl block mb-2">{activeTab === 'saving' ? '💰' : '💡'}</span>
              <h3 className="text-sm sm:text-base font-bold text-gray-800">
                {activeTab === 'saving' ? 'No Recurring Saving Rules Yet' : 'No Recurring Expense Rules Yet'}
              </h3>
              <p className="text-xs text-gray-500 max-w-md mx-auto mt-1 mb-3.5">
                {activeTab === 'saving'
                  ? 'Set up automatic rules for Monthly SIPs, PPF Deposits, NPS, or Insurance to have them auto-recorded in your Savings table!'
                  : 'Set up recurring rules for House Rent, Daily Milk, WiFi, or Subscriptions to have them auto-recorded in your Expenses table!'}
              </p>
              <button
                onClick={handleOpenCreateModal}
                className={`inline-flex items-center gap-1 px-3.5 py-1.5 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm cursor-pointer ${
                  activeTab === 'saving' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                <span>➕</span> Create First {activeTab === 'saving' ? 'Saving' : 'Expense'} Rule
              </button>
            </div>
          ) : (
            <div className="space-y-2.5 sm:space-y-3">
              {currentRules.map((rule) => {
                const isActive = !!rule.is_active;

                return (
                  <div
                    key={rule.id}
                    className={`bg-white rounded-2xl p-3 sm:p-4 shadow-xs border transition-all duration-150 text-left ${
                      isActive ? 'border-gray-200' : 'border-gray-100 opacity-60 bg-gray-50/50'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-left">
                      
                      {/* Left info */}
                      <div className="flex-1 min-w-0 w-full text-left">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1 text-left">
                          
                          {/* Frequency Badge */}
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              rule.frequency === 'monthly'
                                ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                : rule.frequency === 'weekly'
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                : 'bg-blue-100 text-blue-700 border border-blue-200'
                            }`}
                          >
                            <span>
                              {rule.frequency === 'monthly' ? '📅 Monthly' : rule.frequency === 'weekly' ? '📆 Weekly' : '☀️ Daily'}
                            </span>
                            {rule.frequency === 'monthly' && (
                              <span className="font-bold">({rule.day_of_month || '1'}th)</span>
                            )}
                            {rule.frequency === 'weekly' && rule.day_of_week != null && (
                              <span className="font-bold">
                                ({DAYS_OF_WEEK.find((d) => d.value === rule.day_of_week)?.label?.slice(0, 3)})
                              </span>
                            )}
                          </span>

                          {/* Category Badge */}
                          {rule.category_name && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                              activeTab === 'saving'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-gray-100 text-gray-700 border-gray-200'
                            }`}>
                              🏷️ {rule.category_name}
                            </span>
                          )}

                          {/* Status Pill */}
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              isActive ? 'bg-green-50 text-green-700' : 'bg-gray-200 text-gray-600'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                            <span>{isActive ? 'Active' : 'Paused'}</span>
                          </span>

                        </div>

                        {/* Title & Amount */}
                        <div className="flex items-center justify-between sm:justify-start gap-2 text-left">
                          <h4 className="text-sm sm:text-base font-bold text-gray-900 truncate text-left">
                            {rule.title}
                          </h4>
                          <span className={`text-sm sm:text-base font-bold whitespace-nowrap ${
                            activeTab === 'saving' ? 'text-emerald-600' : 'text-red-600'
                          }`}>
                            ₹{parseFloat(rule.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        {/* Timing info */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-gray-500 text-left">
                          <span>
                            Next: <b className="text-gray-700">{rule.next_run_date || 'None'}</b>
                          </span>
                          <span>
                            Last: <b className="text-gray-700">{rule.last_processed_date || 'Never'}</b>
                          </span>
                          <span>
                            Started: {rule.start_date}
                            {rule.end_date ? ` • Ends: ${rule.end_date}` : ''}
                          </span>
                        </div>
                      </div>

                      {/* Right action buttons */}
                      <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                        {/* Active/Pause toggle button */}
                        <button
                          onClick={() => handleToggleActive(rule.id)}
                          className={`text-xs font-semibold px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                              : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                          }`}
                          title={isActive ? 'Pause rule' : 'Activate rule'}
                        >
                          {isActive ? '⏸️ Pause' : '▶️ Resume'}
                        </button>

                        {/* Edit button */}
                        <button
                          onClick={() => handleOpenEditModal(rule)}
                          className="text-xs font-semibold px-2 py-1 rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 transition-colors cursor-pointer"
                          title="Edit rule"
                        >
                          ✏️ Edit
                        </button>

                        {/* Delete button */}
                        <button
                          onClick={() => setRuleToDelete(rule)}
                          className="text-xs font-semibold px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-colors cursor-pointer"
                          title="Delete rule"
                        >
                          🗑️
                        </button>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* ── CREATE / EDIT MODAL ────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 text-left">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-left max-h-[92vh] flex flex-col">
            
            {/* Modal Header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0 ${
              activeTab === 'saving' ? 'bg-emerald-50/50' : 'bg-blue-50/50'
            }`}>
              <h3 className="text-base sm:text-lg font-bold text-gray-800 flex items-center gap-2 text-left">
                <span>
                  {editingRuleId
                    ? activeTab === 'saving' ? '✏️ Edit Recurring Saving / SIP' : '✏️ Edit Recurring Expense'
                    : activeTab === 'saving' ? '➕ Set Up Recurring Saving / SIP' : '➕ Set Up Recurring Expense'}
                </span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1 text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitRule} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 text-left">
              
              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs sm:text-sm text-left">
                  {modalError}
                </div>
              )}

              {/* Title / Description with Autocomplete */}
              <div className="text-left">
                <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">
                  {activeTab === 'saving' ? 'Investment / Asset Name' : 'Payment Title / Description'}
                </label>
                <AutocompleteInput
                  value={title}
                  onChange={setTitle}
                  onSelect={(suggestion) => {
                    setTitle(suggestion.title);
                    if (suggestion.category_id) {
                      setCategoryId(String(suggestion.category_id));
                    }
                  }}
                  fetchSuggestions={
                    activeTab === 'saving'
                      ? fetchSavingSuggestionsOfflineFirst
                      : fetchExpenseSuggestionsOfflineFirst
                  }
                  placeholder={
                    activeTab === 'saving'
                      ? 'e.g. HDFC Small Cap SIP, PPF Deposit, Term Insurance'
                      : 'e.g. House Rent, WiFi Bill, Milk Daily'
                  }
                  required
                  type={activeTab}
                  className={`w-full px-3 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none text-base sm:text-sm text-left ${
                    activeTab === 'saving' ? 'focus:border-emerald-500' : 'focus:border-blue-500'
                  }`}
                />
              </div>

              {/* Amount & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                <div className="text-left">
                  <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">
                    {activeTab === 'saving' ? 'Deposit / Amount (₹)' : 'Amount (₹)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 5000"
                    required
                    className={`w-full px-3 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none text-base sm:text-sm text-left ${
                      activeTab === 'saving' ? 'focus:border-emerald-500' : 'focus:border-blue-500'
                    }`}
                  />
                </div>

                <div className="text-left">
                  <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">
                    {activeTab === 'saving' ? 'Saving Category' : 'Expense Category'}
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className={`w-full px-3 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none text-base sm:text-sm bg-white text-left ${
                      activeTab === 'saving' ? 'focus:border-emerald-500' : 'focus:border-blue-500'
                    }`}
                  >
                    <option value="">Select Category</option>
                    {currentCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Frequency Selector */}
              <div className="text-left">
                <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1.5 text-left">
                  Recurring Frequency
                </label>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-left">
                  {[
                    { key: 'monthly', label: 'Monthly', sub: 'SIP', icon: '📅' },
                    { key: 'weekly', label: 'Weekly', sub: '', icon: '📆' },
                    { key: 'daily', label: 'Daily', sub: '', icon: '☀️' },
                  ].map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFrequency(f.key)}
                      className={`py-2 px-1.5 sm:px-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer select-none ${
                        frequency === f.key
                          ? activeTab === 'saving'
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500 shadow-2xs'
                            : 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500 shadow-2xs'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-base">{f.icon}</span>
                      <span className="leading-tight">{f.label}</span>
                      {f.sub && <span className="text-[10px] opacity-75">({f.sub})</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conditional Timing Inputs */}
              {frequency === 'monthly' && (
                <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-3 text-left">
                  <label className="block text-xs sm:text-sm font-medium text-purple-900 mb-1 text-left">
                    Day of Every Month (1 to 31)
                  </label>
                  <div className="flex items-center gap-2 text-left">
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                      required
                      className="w-24 px-3 py-2 border border-purple-300 rounded-lg text-sm bg-white font-bold text-center"
                    />
                    <span className="text-xs text-purple-700 text-left">
                      Runs on the <b>{dayOfMonth}th</b> of each month (e.g. 5th for SIP)
                    </span>
                  </div>
                </div>
              )}

              {frequency === 'weekly' && (
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3 text-left">
                  <label className="block text-xs sm:text-sm font-medium text-emerald-900 mb-1 text-left">
                    Day of the Week
                  </label>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm bg-white font-medium text-left"
                  >
                    {DAYS_OF_WEEK.map((d) => (
                      <option key={d.value} value={d.value}>
                        Every {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {frequency === 'daily' && (
                <div className={`${activeTab === 'saving' ? 'bg-emerald-50/50 border-emerald-100' : 'bg-blue-50/50 border-blue-100'} border rounded-xl p-3 text-left`}>
                  <span className={`text-xs block ${activeTab === 'saving' ? 'text-emerald-700' : 'text-blue-700'}`}>
                    ☀️ This will automatically be recorded in your <b>{activeTab === 'saving' ? 'Savings' : 'Expenses'}</b> table <b>every single day</b>.
                  </span>
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                <div className="text-left">
                  <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1 text-left">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                    className={`w-full px-3 py-2 sm:py-2.5 border border-gray-300 rounded-lg focus:outline-none text-sm bg-white text-left ${
                      activeTab === 'saving' ? 'focus:border-emerald-500' : 'focus:border-blue-500'
                    }`}
                  />
                  <span className="text-[11px] text-gray-400 mt-0.5 block text-left">
                    Past dates auto-catch up immediately!
                  </span>
                </div>

                <div className="text-left">
                  <div className="flex items-center justify-between mb-1 text-left">
                    <label className="block text-xs sm:text-sm font-medium text-gray-600 text-left">
                      End Date
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-gray-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!hasEndDate}
                        onChange={(e) => setHasEndDate(!e.target.checked)}
                        className={`rounded ${activeTab === 'saving' ? 'text-emerald-600' : 'text-blue-600'}`}
                      />
                      <span>Ongoing / No End</span>
                    </label>
                  </div>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={!hasEndDate}
                    className={`w-full px-3 py-2 sm:py-2.5 border rounded-lg text-sm transition-colors text-left ${
                      hasEndDate
                        ? activeTab === 'saving'
                          ? 'border-gray-300 bg-white focus:border-emerald-500'
                          : 'border-gray-300 bg-white focus:border-blue-500'
                        : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  />
                </div>
              </div>

              {/* Target Table Info Banner */}
              <div className={`p-2.5 rounded-xl text-xs border text-left ${
                activeTab === 'saving'
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                  : 'bg-blue-50/70 border-blue-200 text-blue-800'
              }`}>
                🎯 <b>Target Destination:</b> Recurring rules here will automatically add records into your <b>{activeTab === 'saving' ? 'Savings' : 'Expenses'}</b> table.
              </div>

              {/* Auto Catch-up Notice */}
              <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-2.5 text-xs text-amber-800 text-left">
                ⚡ <b>Smart Catch-Up Engine:</b> If your server is turned off, all missed dates between the last run and server restart will be automatically added without duplicates.
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 sm:flex-initial py-2.5 px-4 border border-gray-300 text-gray-700 rounded-xl text-xs sm:text-sm font-semibold hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className={`flex-1 sm:flex-initial py-2.5 px-5 text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer shadow-sm ${
                    activeTab === 'saving' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {modalLoading
                    ? 'Saving...'
                    : editingRuleId
                    ? `Update Rule`
                    : `Create & Process`}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRMATION MODAL ─────────────────────────────── */}
      {ruleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 text-left">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl text-left">
            <h3 className="text-base font-bold text-gray-900 mb-2 text-left">
              Delete Recurring Rule?
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 mb-4 text-left">
              Are you sure you want to delete <b>"{ruleToDelete.title}"</b>? This will stop future recurring {ruleToDelete.rule_type === 'saving' ? 'saving deposits' : 'expenses'}. Past records already generated in your list will NOT be deleted.
            </p>
            <div className="flex items-center justify-end gap-2 text-left">
              <button
                onClick={() => setRuleToDelete(null)}
                className="px-3.5 py-1.5 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteRule}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
              >
                Delete Rule
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
