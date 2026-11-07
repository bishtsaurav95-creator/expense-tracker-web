import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import Navbar from './Navbar';
import PrivateRoute from './components/PrivateRoute';
import AIChatWidget from './components/AIChatWidget';
import AddExpensePage from './pages/AddExpensePage';
import ExpenseListPage from './pages/ExpenseListPage';
import RecurringRulesPage from './pages/RecurringRulesPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <HashRouter>
          <Navbar />
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Protected Routes */}
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <AddExpensePage />
                </PrivateRoute>
              }
            />
            <Route
              path="/expenses"
              element={
                <PrivateRoute>
                  <ExpenseListPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/recurring"
              element={
                <PrivateRoute>
                  <RecurringRulesPage />
                </PrivateRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          {/* Floating AI Chat Assistant */}
          <AIChatWidget />
        </HashRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
