import {
  API_BASE_URL,
  API_URL,
  CATEGORIES_URL,
  SAVINGS_URL,
  SAVING_CATEGORIES_URL,
  EXPENSE_SUGGESTIONS_URL,
  SAVING_SUGGESTIONS_URL,
  authFetch,
} from './api';

const QUEUE_KEY = 'expense_offline_queue';
const CACHE_KEY = 'expense_offline_cache';
const CATEGORIES_KEY = 'expense_offline_categories';
const SAVINGS_CACHE_KEY = 'saving_offline_cache';
const SAVING_CATEGORIES_KEY = 'saving_offline_categories';

// ─── Server Health Check ────────────────────────────────────────────────────

export async function checkServerHealth(timeoutMs = 2500) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return data.status === 'ok';
    }
    return false;
  } catch (err) {
    return false;
  }
}

// ─── LocalStorage Helpers ───────────────────────────────────────────────────

export function getOfflineQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error reading offline queue:', e);
    return [];
  }
}

export function saveOfflineQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    notifyQueueChange();
  } catch (e) {
    console.error('Error saving offline queue:', e);
  }
}

export function getCachedExpenses() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error reading cached expenses:', e);
    return [];
  }
}

export function saveCachedExpenses(items) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(items));
    // NOTE: Do NOT notify listeners here, to prevent infinite re-fetch loops!
  } catch (e) {
    console.error('Error saving cached expenses:', e);
  }
}

export function getCachedCategories() {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveCachedCategories(categories) {
  try {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  } catch (e) {}
}

// Helper: Get local date in YYYY-MM-DD format (avoids UTC timezone shift)
export function getTodayLocalDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ─── Custom Events for Reactive UI (Loop-Safe) ──────────────────────────────

function notifyQueueChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('expense-queue-change'));
  }
}

function notifySyncComplete() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('expense-sync-complete'));
  }
}

// Subscribed by Navbar for pending count badge
export function subscribeToQueueChange(callback) {
  const handler = () => callback();
  window.addEventListener('expense-queue-change', handler);
  return () => {
    window.removeEventListener('expense-queue-change', handler);
  };
}

// Subscribed by Pages to reload data only after an actual sync succeeds
export function subscribeToSyncComplete(callback) {
  const handler = () => callback();
  window.addEventListener('expense-sync-complete', handler);
  return () => {
    window.removeEventListener('expense-sync-complete', handler);
  };
}

// Alias for backwards compatibility
export const subscribeToSyncState = subscribeToSyncComplete;

// ─── Sync Pending Actions to MySQL Backend ──────────────────────────────────

let isSyncing = false;

export async function syncPendingActions() {
  if (isSyncing || !navigator.onLine) return { synced: 0, pending: getOfflineQueue().length };

  const queue = getOfflineQueue();
  if (queue.length === 0) return { synced: 0, pending: 0 };

  isSyncing = true;
  notifyQueueChange();

  console.log(`[OfflineSync] Starting sync for ${queue.length} pending actions...`);

  const remainingQueue = [...queue];
  let localExpenses = getCachedExpenses();
  let syncCount = 0;

  // Track map of tempId -> real DB id so updates/deletes in the same batch use the real id
  const tempIdToRealId = {};

  try {
    while (remainingQueue.length > 0) {
      const action = remainingQueue[0];

      if (action.type === 'ADD') {
        try {
          const res = await authFetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(action.payload),
          });

          if (!res.ok) throw new Error('Backend failed to add expense');
          const data = await res.json();
          const realId = data.id;

          tempIdToRealId[action.tempId] = realId;

          // Replace tempId with realId in local cached items and clear isOffline flag
          localExpenses = localExpenses.map((item) => {
            if (item.id === action.tempId) {
              return { ...item, id: realId, isOffline: false };
            }
            return item;
          });

          remainingQueue.shift();
          syncCount++;
        } catch (err) {
          console.error('[OfflineSync] Failed to sync ADD action:', err);
          break; // Stop and retry later if network fails mid-sync
        }
      } else if (action.type === 'UPDATE') {
        const targetId = tempIdToRealId[action.id] || action.id;
        try {
          const res = await authFetch(`${API_URL}/${targetId}`, {
            method: 'PUT',
            body: JSON.stringify(action.payload),
          });

          if (!res.ok) throw new Error('Backend failed to update expense');

          localExpenses = localExpenses.map((item) => {
            if (item.id === action.id || item.id === targetId) {
              return { ...item, id: targetId, ...action.payload, isOffline: false };
            }
            return item;
          });

          remainingQueue.shift();
          syncCount++;
        } catch (err) {
          console.error('[OfflineSync] Failed to sync UPDATE action:', err);
          break;
        }
      } else if (action.type === 'DELETE') {
        const targetId = tempIdToRealId[action.id] || action.id;

        // If it was only an offline item that never reached the backend, no server call needed
        if (String(targetId).startsWith('offline_')) {
          remainingQueue.shift();
          syncCount++;
        } else {
          try {
            const res = await authFetch(`${API_URL}/${targetId}`, {
              method: 'DELETE',
            });

            if (!res.ok && res.status !== 404) {
              throw new Error('Backend failed to delete expense');
            }

            remainingQueue.shift();
            syncCount++;
          } catch (err) {
            console.error('[OfflineSync] Failed to sync DELETE action:', err);
            break;
          }
        }
      } else if (action.type === 'SAVING_ADD') {
        try {
          const res = await authFetch(SAVINGS_URL, {
            method: 'POST',
            body: JSON.stringify(action.payload),
          });
          if (!res.ok) throw new Error('Backend failed to add saving');
          const data = await res.json();
          const realId = data.id;
          tempIdToRealId[action.tempId] = realId;
          const cachedSavings = getCachedSavings();
          saveCachedSavings(
            cachedSavings.map((item) =>
              item.id === action.tempId ? { ...item, id: realId, isOffline: false } : item
            )
          );
          remainingQueue.shift();
          syncCount++;
        } catch (err) {
          console.error('[OfflineSync] Failed to sync SAVING_ADD action:', err);
          break;
        }
      } else if (action.type === 'SAVING_UPDATE') {
        const targetId = tempIdToRealId[action.id] || action.id;
        try {
          const res = await authFetch(`${SAVINGS_URL}/${targetId}`, {
            method: 'PUT',
            body: JSON.stringify(action.payload),
          });
          if (!res.ok) throw new Error('Backend failed to update saving');
          const cachedSavings = getCachedSavings();
          saveCachedSavings(
            cachedSavings.map((item) =>
              item.id === action.id || item.id === targetId ? { ...item, id: targetId, ...action.payload, isOffline: false } : item
            )
          );
          remainingQueue.shift();
          syncCount++;
        } catch (err) {
          console.error('[OfflineSync] Failed to sync SAVING_UPDATE action:', err);
          break;
        }
      } else if (action.type === 'SAVING_DELETE') {
        const targetId = tempIdToRealId[action.id] || action.id;
        if (String(targetId).startsWith('offline_')) {
          remainingQueue.shift();
          syncCount++;
        } else {
          try {
            const res = await authFetch(`${SAVINGS_URL}/${targetId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Backend failed to delete saving');
            remainingQueue.shift();
            syncCount++;
          } catch (err) {
            console.error('[OfflineSync] Failed to sync SAVING_DELETE action:', err);
            break;
          }
        }
      } else {
        remainingQueue.shift();
      }
    }
  } finally {
    saveOfflineQueue(remainingQueue);
    saveCachedExpenses(localExpenses);
    isSyncing = false;
    if (syncCount > 0) {
      notifySyncComplete();
    }
    console.log(`[OfflineSync] Sync complete. Synced: ${syncCount}, Remaining: ${remainingQueue.length}`);
  }

  return { synced: syncCount, pending: remainingQueue.length };
}

/**
 * Manual sync button trigger:
 * 1. Checks if backend server is online & reachable
 * 2. If unreachable -> returns { success: false, message: 'Server is offline...' }
 * 3. If reachable -> syncs pending queue to MySQL & returns success
 */
export async function manualSyncWithServer() {
  const isServerOnline = await checkServerHealth(3500);
  if (!isServerOnline) {
    return {
      success: false,
      isOnline: false,
      message: 'Server is offline. Unable to reach database.',
    };
  }

  const queue = getOfflineQueue();
  if (queue.length === 0) {
    return {
      success: true,
      isOnline: true,
      synced: 0,
      message: 'Server is online! All data is already up to date.',
    };
  }

  const result = await syncPendingActions();
  if (result.synced > 0) {
    return {
      success: true,
      isOnline: true,
      synced: result.synced,
      remaining: result.pending,
      message: `Synced ${result.synced} offline expense${result.synced !== 1 ? 's' : ''} with database!`,
    };
  }

  return {
    success: true,
    isOnline: true,
    synced: 0,
    remaining: result.pending,
    message: 'Server is online.',
  };
}

// Automatically listen to window 'online' event to trigger sync
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[OfflineSync] Network status online. Triggering automatic sync...');
    syncPendingActions();
  });
}

// ─── High-Level Offline-First Expense Operations ────────────────────────────

/**
 * Fetch expenses with offline fallback & cache
 */
export async function fetchExpensesOfflineFirst({ month, year, date, category_ids, categories, items, titles } = {}) {
  // If online, attempt to fetch from backend
  if (navigator.onLine) {
    try {
      const params = new URLSearchParams();
      if (date) {
        params.set('date', date);
      } else {
        if (month) params.set('month', month);
        if (year) params.set('year', year);
      }
      if (category_ids && category_ids.length > 0) {
        params.set('category_ids', Array.isArray(category_ids) ? category_ids.join(',') : category_ids);
      } else if (categories && categories.length > 0) {
        params.set('categories', Array.isArray(categories) ? categories.join(',') : categories);
      }
      if (items && items.length > 0) {
        params.set('items', Array.isArray(items) ? items.join(',') : items);
      } else if (titles && titles.length > 0) {
        params.set('titles', Array.isArray(titles) ? titles.join(',') : titles);
      }

      const url = params.toString() ? `${API_URL}?${params}` : API_URL;
      const res = await authFetch(url);

      if (res.ok) {
        const serverData = await res.json();
        const serverList = Array.isArray(serverData) ? serverData : [];

        // Merge with any local items that are still isOffline: true (pending sync)
        const cached = getCachedExpenses();
        const pendingOfflineItems = cached.filter((c) => c.isOffline);

        // Map server items to ensure isOffline: false
        const normalizedServer = serverList.map((item) => ({ ...item, isOffline: false }));

        // Deduplicate: remove server items that have the same ID
        const combined = [
          ...pendingOfflineItems,
          ...normalizedServer.filter((s) => !pendingOfflineItems.some((p) => p.id === s.id)),
        ];

        // Save full updated list to local cache
        saveCachedExpenses(combined);

        // Filter for caller's query
        return filterLocalExpenses(combined, { month, year, date, category_ids, categories, items, titles });
      }
    } catch (err) {
      console.warn('[OfflineSync] Network fetch failed, falling back to cached local storage:', err);
    }
  }

  // Offline fallback: Read directly from local cache
  const cached = getCachedExpenses();
  return filterLocalExpenses(cached, { month, year, date, category_ids, categories, items, titles });
}

/**
 * Filter local expenses by month, year, date, categories, or items (titles)
 */
function filterLocalExpenses(itemsList, { month, year, date, category_ids, categories, items, titles } = {}) {
  if (!itemsList || !itemsList.length) return [];

  const rawCats = category_ids || categories;
  let targetCats = [];
  if (rawCats) {
    targetCats = Array.isArray(rawCats)
      ? rawCats.map(String)
      : String(rawCats).split(',').map((s) => s.trim()).filter(Boolean);
  }

  const rawItems = items || titles;
  let targetItems = [];
  if (rawItems) {
    targetItems = Array.isArray(rawItems)
      ? rawItems.map((s) => String(s).toLowerCase().trim())
      : String(rawItems).split(',').map((s) => s.toLowerCase().trim()).filter(Boolean);
  }

  return itemsList.filter((item) => {
    if (!item.date) return false;
    const itemDate = item.date.slice(0, 10); // "YYYY-MM-DD"

    if (date) {
      if (itemDate !== date) return false;
    } else {
      const [itemY, itemM] = itemDate.split('-');
      if (year && parseInt(itemY, 10) !== parseInt(year, 10)) {
        return false;
      }
      if (month && parseInt(itemM, 10) !== parseInt(month, 10)) {
        return false;
      }
    }

    if (targetCats.length > 0) {
      const itemCatId = item.category_id != null ? String(item.category_id) : '';
      const itemCatName = (item.category || '').toLowerCase();
      const match = targetCats.some(
        (c) => c === itemCatId || c.toLowerCase() === itemCatName
      );
      if (!match) return false;
    }

    if (targetItems.length > 0) {
      const itemTitle = (item.title || '').toLowerCase().trim();
      if (!targetItems.includes(itemTitle)) return false;
    }

    return true;
  });
}

/**
 * Distinct items offline helper
 */
export async function fetchDistinctItemsOfflineFirst({ category_ids } = {}) {
  const params = new URLSearchParams();
  if (category_ids && category_ids.length > 0) {
    params.set('category_ids', Array.isArray(category_ids) ? category_ids.join(',') : category_ids);
  }

  if (navigator.onLine) {
    try {
      const url = params.toString()
        ? `${API_URL}/distinct-items?${params}`
        : `${API_URL}/distinct-items`;
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (e) {
      console.warn('[OfflineSync] Failed to fetch distinct items online, reading from cache');
    }
  }

  // Fallback to cached expenses
  const cached = getCachedExpenses();
  const selectedCatStrings = category_ids
    ? (Array.isArray(category_ids) ? category_ids.map(String) : String(category_ids).split(','))
    : [];
  const map = new Map();

  cached.forEach((item) => {
    if (!item.title) return;
    const catIdStr = item.category_id != null ? String(item.category_id) : '';
    if (selectedCatStrings.length > 0 && !selectedCatStrings.includes(catIdStr)) {
      return;
    }
    if (!map.has(item.title)) {
      map.set(item.title, {
        title: item.title,
        category_id: item.category_id,
        category: item.category || 'Other',
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Add Expense — Online to Backend + MySQL, or Offline to LocalStorage with isOffline: true
 */
export async function addExpenseOfflineFirst(expenseData, categoryName = '') {
  let isOnlineSuccess = false;
  let finalItem = null;

  // Ensure date always defaults to today's local date if empty or missing
  const effectiveDate = (expenseData.date && String(expenseData.date).trim())
    ? String(expenseData.date).trim().slice(0, 10)
    : getTodayLocalDate();

  const normalizedPayload = {
    ...expenseData,
    date: effectiveDate,
  };

  if (navigator.onLine) {
    try {
      const res = await authFetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(normalizedPayload),
      });

      if (res.ok) {
        const data = await res.json();
        finalItem = {
          id: data.id,
          title: normalizedPayload.title,
          amount: parseFloat(normalizedPayload.amount),
          category_id: normalizedPayload.category_id,
          category: categoryName || 'Other',
          date: data.date || effectiveDate,
          isOffline: false,
        };
        isOnlineSuccess = true;
      }
    } catch (err) {
      console.warn('[OfflineSync] Online add failed, saving offline:', err);
    }
  }

  // If online add failed or app is offline
  if (!isOnlineSuccess) {
    const tempId = 'offline_' + Date.now();
    finalItem = {
      id: tempId,
      title: normalizedPayload.title,
      amount: parseFloat(normalizedPayload.amount),
      category_id: normalizedPayload.category_id,
      category: categoryName || 'Other',
      date: effectiveDate,
      isOffline: true,
    };

    // Add to pending queue
    const queue = getOfflineQueue();
    queue.push({
      type: 'ADD',
      tempId,
      payload: normalizedPayload,
      timestamp: Date.now(),
    });
    saveOfflineQueue(queue);
  }

  // Update local cache
  const cached = getCachedExpenses();
  saveCachedExpenses([finalItem, ...cached]);

  return { success: true, item: finalItem, isOffline: !isOnlineSuccess };
}

/**
 * Update Expense — Online to Backend or Offline to LocalStorage
 */
export async function updateExpenseOfflineFirst(updatedData, categoryName = '') {
  let isOnlineSuccess = false;
  const isTempId = String(updatedData.id).startsWith('offline_');

  // Fallback to today's local date if date was cleared
  const effectiveDate = (updatedData.date && String(updatedData.date).trim())
    ? String(updatedData.date).trim().slice(0, 10)
    : getTodayLocalDate();

  const normalizedPayload = {
    title: updatedData.title,
    amount: updatedData.amount,
    category_id: updatedData.category_id,
    date: effectiveDate,
  };

  if (navigator.onLine && !isTempId) {
    try {
      const res = await authFetch(`${API_URL}/${updatedData.id}`, {
        method: 'PUT',
        body: JSON.stringify(normalizedPayload),
      });

      if (res.ok) {
        isOnlineSuccess = true;
      }
    } catch (err) {
      console.warn('[OfflineSync] Online update failed, saving offline:', err);
    }
  }

  // Update in local cache
  const cached = getCachedExpenses();
  const updatedList = cached.map((item) => {
    if (item.id === updatedData.id) {
      return {
        ...item,
        ...normalizedPayload,
        category: categoryName || item.category,
        isOffline: !isOnlineSuccess || item.isOffline,
      };
    }
    return item;
  });
  saveCachedExpenses(updatedList);

  if (!isOnlineSuccess) {
    const queue = getOfflineQueue();
    queue.push({
      type: 'UPDATE',
      id: updatedData.id,
      payload: normalizedPayload,
      timestamp: Date.now(),
    });
    saveOfflineQueue(queue);
  }

  return { success: true, isOffline: !isOnlineSuccess };
}

/**
 * Delete Expense — Online to Backend or Offline to LocalStorage
 */
export async function deleteExpenseOfflineFirst(id) {
  let isOnlineSuccess = false;
  const isTempId = String(id).startsWith('offline_');

  if (navigator.onLine && !isTempId) {
    try {
      const res = await authFetch(`${API_URL}/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        isOnlineSuccess = true;
      }
    } catch (err) {
      console.warn('[OfflineSync] Online delete failed, queueing offline:', err);
    }
  }

  // Remove from local cache
  const cached = getCachedExpenses();
  saveCachedExpenses(cached.filter((item) => item.id !== id));

  // Handle queue
  const queue = getOfflineQueue();
  if (isTempId) {
    // If it was an offline-created item that hasn't synced yet, remove its ADD action from the queue
    const filteredQueue = queue.filter((q) => q.tempId !== id && q.id !== id);
    saveOfflineQueue(filteredQueue);
  } else if (!isOnlineSuccess) {
    queue.push({
      type: 'DELETE',
      id,
      timestamp: Date.now(),
    });
    saveOfflineQueue(queue);
  }

  return { success: true, isOffline: !isOnlineSuccess };
}

/**
 * Categories offline helper
 */
export async function fetchCategoriesOfflineFirst() {
  if (navigator.onLine) {
    try {
      const res = await authFetch(CATEGORIES_URL);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          saveCachedCategories(data);
          return data;
        }
      }
    } catch (e) {}
  }
  return getCachedCategories();
}

// ─── SAVINGS OFFLINE-FIRST HELPERS ──────────────────────────────────────────

export function getCachedSavings() {
  try {
    const raw = localStorage.getItem(SAVINGS_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveCachedSavings(items) {
  try {
    localStorage.setItem(SAVINGS_CACHE_KEY, JSON.stringify(items || []));
  } catch (e) {}
}

export function getCachedSavingCategories() {
  try {
    const raw = localStorage.getItem(SAVING_CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function saveCachedSavingCategories(cats) {
  try {
    localStorage.setItem(SAVING_CATEGORIES_KEY, JSON.stringify(cats || []));
  } catch (e) {}
}

export async function fetchSavingCategoriesOfflineFirst() {
  if (navigator.onLine) {
    try {
      const res = await authFetch(SAVING_CATEGORIES_URL);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          saveCachedSavingCategories(data);
          return data;
        }
      }
    } catch (e) {}
  }
  return getCachedSavingCategories();
}

export async function fetchSavingsOfflineFirst({ month, year, date, category_ids, categories, items, titles } = {}) {
  if (navigator.onLine) {
    try {
      const params = new URLSearchParams();
      if (date) params.set('date', date);
      if (month) params.set('month', month);
      if (year) params.set('year', year);

      const rawCats = category_ids || categories;
      if (rawCats) {
        params.set('category_ids', Array.isArray(rawCats) ? rawCats.join(',') : rawCats);
      }

      const rawTitles = items || titles;
      if (rawTitles) {
        params.set('titles', Array.isArray(rawTitles) ? rawTitles.join(',') : rawTitles);
      }

      const url = params.toString() ? `${SAVINGS_URL}?${params}` : SAVINGS_URL;
      const res = await authFetch(url);

      if (res.ok) {
        const serverData = await res.json();
        const serverList = Array.isArray(serverData) ? serverData : [];

        const cached = getCachedSavings();
        const pendingOfflineItems = cached.filter((c) => c.isOffline);
        const normalizedServer = serverList.map((item) => ({ ...item, isOffline: false }));

        const combined = [
          ...pendingOfflineItems,
          ...normalizedServer.filter((s) => !pendingOfflineItems.some((p) => p.id === s.id)),
        ];

        saveCachedSavings(combined);
        return filterLocalExpenses(combined, { month, year, date, category_ids, categories, items, titles });
      }
    } catch (err) {
      console.warn('[OfflineSync] Savings network fetch failed, using cache:', err);
    }
  }

  const cached = getCachedSavings();
  return filterLocalExpenses(cached, { month, year, date, category_ids, categories, items, titles });
}

export async function fetchDistinctSavingItemsOfflineFirst(arg = {}) {
  const category_ids = (arg && typeof arg === 'object' && !Array.isArray(arg) && 'category_ids' in arg)
    ? arg.category_ids
    : arg;

  if (navigator.onLine) {
    try {
      const params = new URLSearchParams();
      if (category_ids && (Array.isArray(category_ids) ? category_ids.length > 0 : String(category_ids).trim())) {
        params.set(
          'category_ids',
          Array.isArray(category_ids) ? category_ids.join(',') : category_ids
        );
      }
      const url = params.toString()
        ? `${SAVINGS_URL}/distinct-items?${params}`
        : `${SAVINGS_URL}/distinct-items`;
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (err) {}
  }

  const cached = getCachedSavings();
  const selectedCatStrings = category_ids
    ? (Array.isArray(category_ids) ? category_ids.map(String) : String(category_ids).split(','))
    : [];
  const map = new Map();

  cached.forEach((item) => {
    if (!item.title) return;
    const catIdStr = item.category_id != null ? String(item.category_id) : '';
    if (selectedCatStrings.length > 0 && !selectedCatStrings.includes(catIdStr)) {
      return;
    }
    if (!map.has(item.title)) {
      map.set(item.title, {
        title: item.title,
        category_id: item.category_id,
        category: item.category || 'SIP',
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
}

export async function addSavingOfflineFirst(savingData, categoryName = '') {
  let isOnlineSuccess = false;
  let finalItem = null;

  const effectiveDate = (savingData.date && String(savingData.date).trim())
    ? String(savingData.date).trim().slice(0, 10)
    : getTodayLocalDate();

  const normalizedPayload = {
    ...savingData,
    date: effectiveDate,
  };

  if (navigator.onLine) {
    try {
      const res = await authFetch(SAVINGS_URL, {
        method: 'POST',
        body: JSON.stringify(normalizedPayload),
      });

      if (res.ok) {
        const data = await res.json();
        finalItem = {
          id: data.id,
          title: normalizedPayload.title,
          amount: parseFloat(normalizedPayload.amount),
          category_id: normalizedPayload.category_id,
          category: categoryName || 'SIP',
          date: data.date || effectiveDate,
          isOffline: false,
        };
        isOnlineSuccess = true;
      }
    } catch (err) {
      console.warn('[OfflineSync] Online add saving failed, saving offline:', err);
    }
  }

  if (!isOnlineSuccess) {
    const tempId = 'offline_saving_' + Date.now();
    finalItem = {
      id: tempId,
      title: normalizedPayload.title,
      amount: parseFloat(normalizedPayload.amount),
      category_id: normalizedPayload.category_id,
      category: categoryName || 'SIP',
      date: effectiveDate,
      isOffline: true,
    };

    const queue = getOfflineQueue();
    queue.push({
      type: 'SAVING_ADD',
      tempId,
      payload: normalizedPayload,
      timestamp: Date.now(),
    });
    saveOfflineQueue(queue);
  }

  const cached = getCachedSavings();
  saveCachedSavings([finalItem, ...cached]);

  return { success: true, item: finalItem, isOffline: !isOnlineSuccess };
}

export async function updateSavingOfflineFirst(updatedData, categoryName = '') {
  let isOnlineSuccess = false;
  const isTempId = String(updatedData.id).startsWith('offline_');

  const effectiveDate = (updatedData.date && String(updatedData.date).trim())
    ? String(updatedData.date).trim().slice(0, 10)
    : getTodayLocalDate();

  const normalizedPayload = {
    title: updatedData.title,
    amount: updatedData.amount,
    category_id: updatedData.category_id,
    date: effectiveDate,
  };

  if (navigator.onLine && !isTempId) {
    try {
      const res = await authFetch(`${SAVINGS_URL}/${updatedData.id}`, {
        method: 'PUT',
        body: JSON.stringify(normalizedPayload),
      });

      if (res.ok) {
        isOnlineSuccess = true;
      }
    } catch (err) {
      console.warn('[OfflineSync] Online update saving failed, queueing offline:', err);
    }
  }

  const cached = getCachedSavings();
  const updatedList = cached.map((item) => {
    if (item.id === updatedData.id) {
      return {
        ...item,
        ...normalizedPayload,
        category: categoryName || item.category,
        isOffline: !isOnlineSuccess || item.isOffline,
      };
    }
    return item;
  });
  saveCachedSavings(updatedList);

  if (!isOnlineSuccess) {
    const queue = getOfflineQueue();
    queue.push({
      type: 'SAVING_UPDATE',
      id: updatedData.id,
      payload: normalizedPayload,
      timestamp: Date.now(),
    });
    saveOfflineQueue(queue);
  }

  return { success: true, isOffline: !isOnlineSuccess };
}

export async function deleteSavingOfflineFirst(id) {
  let isOnlineSuccess = false;
  const isTempId = String(id).startsWith('offline_');

  if (navigator.onLine && !isTempId) {
    try {
      const res = await authFetch(`${SAVINGS_URL}/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        isOnlineSuccess = true;
      }
    } catch (err) {
      console.warn('[OfflineSync] Online delete saving failed, queueing offline:', err);
    }
  }

  const cached = getCachedSavings();
  saveCachedSavings(cached.filter((item) => item.id !== id));

  const queue = getOfflineQueue();
  if (isTempId) {
    const filteredQueue = queue.filter((q) => q.tempId !== id && q.id !== id);
    saveOfflineQueue(filteredQueue);
  } else if (!isOnlineSuccess) {
    queue.push({
      type: 'SAVING_DELETE',
      id,
      timestamp: Date.now(),
    });
    saveOfflineQueue(queue);
  }

  return { success: true, isOffline: !isOnlineSuccess };
}

// ─── Autocomplete Suggestions (Offline-First) ──────────────────────────────

export async function fetchExpenseSuggestionsOfflineFirst(query) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];

  if (navigator.onLine) {
    try {
      const res = await authFetch(`${EXPENSE_SUGGESTIONS_URL}?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (e) {
      console.warn('[OfflineSync] Failed to fetch expense suggestions online, reading from cache:', e);
    }
  }

  // Fallback to local cached expenses (case-insensitive substring match, unique by lowercase title, most recent category)
  const cached = getCachedExpenses();
  const lowerQ = q.toLowerCase();
  const map = new Map();

  // Sort descending by date so the latest record's category is used
  const sorted = [...cached].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  for (const item of sorted) {
    if (!item.title) continue;
    const trimmedTitle = item.title.trim();
    if (trimmedTitle.toLowerCase().includes(lowerQ)) {
      const key = trimmedTitle.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          title: trimmedTitle,
          category_id: item.category_id != null ? item.category_id : null,
          category_name: item.category || '',
        });
      }
    }
    if (map.size >= 10) break;
  }

  const list = Array.from(map.values());
  list.sort((a, b) => {
    const aStarts = a.title.toLowerCase().startsWith(lowerQ);
    const bStarts = b.title.toLowerCase().startsWith(lowerQ);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return a.title.localeCompare(b.title);
  });
  return list;
}

export async function fetchSavingSuggestionsOfflineFirst(query) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];

  if (navigator.onLine) {
    try {
      const res = await authFetch(`${SAVING_SUGGESTIONS_URL}?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (e) {
      console.warn('[OfflineSync] Failed to fetch saving suggestions online, reading from cache:', e);
    }
  }

  // Fallback to local cached savings
  const cached = getCachedSavings();
  const lowerQ = q.toLowerCase();
  const map = new Map();

  const sorted = [...cached].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  for (const item of sorted) {
    if (!item.title) continue;
    const trimmedTitle = item.title.trim();
    if (trimmedTitle.toLowerCase().includes(lowerQ)) {
      const key = trimmedTitle.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          title: trimmedTitle,
          category_id: item.category_id != null ? item.category_id : null,
          category_name: item.category || '',
        });
      }
    }
    if (map.size >= 10) break;
  }

  const list = Array.from(map.values());
  list.sort((a, b) => {
    const aStarts = a.title.toLowerCase().startsWith(lowerQ);
    const bStarts = b.title.toLowerCase().startsWith(lowerQ);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return a.title.localeCompare(b.title);
  });
  return list;
}


