import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import { getOfflineQueue, manualSyncWithServer, checkServerHealth, subscribeToQueueChange } from './offlineSync';

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [isNetworkOnline, setIsNetworkOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isBackendOnline, setIsBackendOnline] = useState(null); // null = checking, true = up, false = down
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Actively check backend health
  const verifyHealth = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsNetworkOnline(false);
      setIsBackendOnline(false);
      return false;
    }
    setIsNetworkOnline(true);
    const alive = await checkServerHealth(2500);
    setIsBackendOnline(alive);
    return alive;
  }, []);

  useEffect(() => {
    const updateQueue = () => {
      setPendingCount(getOfflineQueue().length);
    };

    updateQueue();
    verifyHealth();

    // Re-check periodically every 15s (lightweight, non-blocking)
    const intervalId = setInterval(() => {
      verifyHealth();
      updateQueue();
    }, 15000);

    const onOnline = () => {
      setIsNetworkOnline(true);
      verifyHealth().then((alive) => {
        if (alive && getOfflineQueue().length > 0) {
          handleSync(true);
        }
      });
    };

    const onOffline = () => {
      setIsNetworkOnline(false);
      setIsBackendOnline(false);
    };

    const onFocus = () => {
      verifyHealth();
      updateQueue();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onFocus);

    // Only listen to queue changes to update the count badge
    const unsubscribe = subscribeToQueueChange(() => {
      updateQueue();
    });

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', onFocus);
      unsubscribe();
    };
  }, [verifyHealth]);

  const handleSync = async (silent = false) => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await manualSyncWithServer();
      setIsBackendOnline(res.isOnline);

      if (!res.isOnline) {
        if (!silent) {
          showToast('Server is offline. Unable to reach database.', 'error');
        }
      } else if (res.synced > 0) {
        showToast(`✅ Successfully synced ${res.synced} offline item(s) with database!`, 'success');
      } else if (!silent) {
        showToast('✅ Server is online! All data is already up to date.', 'success');
      }
    } catch (err) {
      setIsBackendOnline(false);
      if (!silent) {
        showToast('Server is offline. Unable to reach database.', 'error');
      }
    } finally {
      setSyncing(false);
      setPendingCount(getOfflineQueue().length);
    }
  };

  const desktopLinkClass = ({ isActive }) =>
    `px-3 py-1.5 rounded-md text-sm font-semibold transition-colors duration-200 ${
      isActive ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`;

  const mobileBottomLinkClass = ({ isActive }) =>
    `flex flex-col items-center justify-center flex-1 py-1 text-xs font-semibold transition-colors duration-150 ${
      isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'
    }`;

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const toggleAIChat = () => {
    // Dispatch custom event to trigger floating AI widget on mobile
    window.dispatchEvent(new CustomEvent('toggle-ai-chat'));
  };

  return (
    <>
      {/* ── Top Header ────────────────────────────────────────────── */}
      <nav className="bg-white/95 backdrop-blur-md shadow-xs border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="text-lg sm:text-xl">💸</span>
            <span className="text-sm sm:text-base font-bold text-blue-600 tracking-tight">
              Expense Tracker
            </span>
          </div>

          {/* Top Actions: Sync & Status Badges */}
          {isAuthenticated ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Sync Button */}
              <button
                onClick={() => handleSync(false)}
                disabled={syncing}
                title="Check database connection & sync offline expenses"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-700 border border-gray-200 transition-all shadow-2xs active:scale-95 disabled:opacity-60 cursor-pointer"
              >
                <span className={`text-xs ${syncing ? 'animate-spin inline-block' : ''}`}>🔄</span>
                <span className="hidden sm:inline">{syncing ? 'Checking...' : 'Sync'}</span>
                {pendingCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                    {pendingCount}
                  </span>
                )}
              </button>

              {/* Status Indicator Pill */}
              {!isNetworkOnline ? (
                <span
                  title="No internet connection detected on this device"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 border border-red-200"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></span>
                  <span className="hidden sm:inline">No Internet</span>
                </span>
              ) : isBackendOnline === false ? (
                <span
                  title="Backend server is not running or database is unreachable"
                  className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-700 border border-rose-200"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                  <span className="hidden sm:inline">Server Offline</span>
                  <span className="sm:hidden text-[10px]">Off</span>
                </span>
              ) : isBackendOnline === null ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] text-gray-500 bg-gray-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-400"></span>
                  <span className="hidden sm:inline">Checking...</span>
                </span>
              ) : pendingCount > 0 ? (
                <span
                  title={`${pendingCount} offline items waiting to sync`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                  <span>{pendingCount} Pending</span>
                </span>
              ) : (
                <span
                  title="Connected to MySQL Backend"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  <span className="hidden sm:inline">Online</span>
                </span>
              )}

              {/* Desktop Nav Links */}
              <div className="hidden sm:flex items-center gap-1.5 ml-2 pl-3 border-l border-gray-200">
                <NavLink to="/" end className={desktopLinkClass}>Add</NavLink>
                <NavLink to="/expenses" className={desktopLinkClass}>List</NavLink>
                <NavLink to="/recurring" className={desktopLinkClass}>Recurring</NavLink>
                <span className="text-xs text-gray-500 ml-1">
                  👤 <span className="font-medium text-gray-700">{user?.username}</span>
                </span>
              </div>

              {/* Logout Button */}
              <button
                onClick={handleLogout}
                title="Logout"
                className="text-xs font-semibold px-2 py-1 rounded-lg text-red-500 hover:bg-red-50 transition-colors ml-1 cursor-pointer flex items-center gap-1"
              >
                <span className="hidden sm:inline">Logout</span>
                <span className="sm:hidden text-sm">🚪</span>
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <NavLink to="/login" className="px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold text-gray-700 hover:bg-gray-100">
                Sign In
              </NavLink>
              <NavLink
                to="/register"
                className="px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Register
              </NavLink>
            </div>
          )}
        </div>
      </nav>

      {/* ── Mobile Native Bottom Navigation Bar (sm:hidden) ────────── */}
      {isAuthenticated && (
        <div className="sm:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-gray-200 z-40 flex items-center justify-around py-1.5 px-1 shadow-lg">
          
          {/* Tab 1: Add Expense */}
          <NavLink to="/" end className={mobileBottomLinkClass}>
            <span className="text-lg">➕</span>
            <span className="mt-0.5 text-[11px]">Add</span>
          </NavLink>

          {/* Tab 2: Expenses List */}
          <NavLink to="/expenses" className={mobileBottomLinkClass}>
            <span className="text-lg">📋</span>
            <span className="mt-0.5 text-[11px]">Expenses</span>
          </NavLink>

          {/* Tab 3: Recurring Rules */}
          <NavLink to="/recurring" className={mobileBottomLinkClass}>
            <span className="text-lg">🔄</span>
            <span className="mt-0.5 text-[11px]">Recurring</span>
          </NavLink>

          {/* Tab 4: Ask AI */}
          <button
            onClick={toggleAIChat}
            className="flex flex-col items-center justify-center flex-1 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
          >
            <span className="text-lg relative">
              🤖
              <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            </span>
            <span className="mt-0.5 text-[11px]">Ask AI</span>
          </button>

        </div>
      )}
    </>
  );
}
