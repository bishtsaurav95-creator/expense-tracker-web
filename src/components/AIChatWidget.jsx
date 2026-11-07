import React, { useState, useRef, useEffect } from 'react';
import { ASK_AI_URL, authFetch } from '../api';
import { useAuth } from '../context/AuthContext';

// Helper: parse simple markdown bold **text**
function FormattedInlineText({ text }) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span>
      {parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={idx} className="font-semibold text-gray-900">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </span>
  );
}

// Helper: render beautiful responsive table
function TableBlock({ headers, rows }) {
  if (!headers || headers.length === 0 || !rows || rows.length === 0) return null;

  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-gray-200/90 shadow-xs bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-gradient-to-r from-gray-50 to-blue-50/30 border-b border-gray-200 text-gray-600 text-[11px] uppercase tracking-wider font-semibold">
              {headers.map((h, i) => (
                <th
                  key={i}
                  className={`px-3 py-2 whitespace-nowrap ${
                    h.toLowerCase().includes('amount') || h.toLowerCase().includes('total')
                      ? 'text-right'
                      : 'text-left'
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className="hover:bg-blue-50/40 transition-colors duration-100"
              >
                {row.map((cell, cIdx) => {
                  const header = (headers[cIdx] || '').toLowerCase();
                  const isAmount = header.includes('amount') || header.includes('total') || header.includes('spent');
                  const isCategory = header.includes('category');
                  const isDate = header.includes('date');

                  return (
                    <td
                      key={cIdx}
                      className={`px-3 py-2 text-xs ${
                        isAmount ? 'text-right font-semibold text-gray-900 whitespace-nowrap' : 'text-left'
                      }`}
                    >
                      {isCategory ? (
                        <span className="inline-block bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[11px] font-medium border border-blue-100 whitespace-nowrap">
                          {cell}
                        </span>
                      ) : isDate ? (
                        <span className="text-gray-500 text-[11px] whitespace-nowrap">
                          {cell}
                        </span>
                      ) : isAmount ? (
                        <span>{cell}</span>
                      ) : (
                        <span className="text-gray-800 font-medium">{cell}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Helper: parse raw message text or tableData into display blocks
function parseMessageBlocks(text, tableData) {
  if (!text) return [];

  const lines = text.split('\n');
  const blocks = [];
  let currentText = [];
  let currentTable = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
      if (!inTable) {
        if (currentText.length > 0) {
          const t = currentText.join('\n').trim();
          if (t) blocks.push({ type: 'text', content: t });
          currentText = [];
        }
        inTable = true;
      }

      // Ignore separator line like | --- | --- |
      const isSeparator = /^\|[\s\-:|]+\|$/.test(trimmed);
      if (!isSeparator) {
        const cells = trimmed
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());
        currentTable.push(cells);
      }
    } else {
      if (inTable) {
        if (currentTable.length > 0) {
          const headers = currentTable[0];
          const rows = currentTable.slice(1);
          blocks.push({ type: 'table', headers, rows });
          currentTable = [];
        }
        inTable = false;
      }
      currentText.push(rawLine);
    }
  }

  if (inTable && currentTable.length > 0) {
    const headers = currentTable[0];
    const rows = currentTable.slice(1);
    blocks.push({ type: 'table', headers, rows });
  }

  if (currentText.length > 0) {
    const t = currentText.join('\n').trim();
    if (t) blocks.push({ type: 'text', content: t });
  }

  // Safety Net: If no table was parsed from markdown, but tableData exists with multiple items
  const hasTableBlock = blocks.some((b) => b.type === 'table');
  if (!hasTableBlock && Array.isArray(tableData) && tableData.length > 1) {
    const keys = Object.keys(tableData[0]);
    const cleanHeader = (k) => {
      const lk = k.toLowerCase();
      if (lk === 'item' || lk === 'title') return 'Item';
      if (lk === 'category') return 'Category';
      if (lk.includes('amount') || lk.includes('total')) return 'Amount';
      if (lk === 'date') return 'Date';
      return k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' ');
    };

    const headers = keys.map(cleanHeader);
    const rows = tableData.map((row) =>
      keys.map((k) => {
        let val = row[k];
        if (val instanceof Date) val = val.toISOString().slice(0, 10);
        const lk = k.toLowerCase();
        if (lk.includes('amount') || lk.includes('total') || lk.includes('spent')) {
          const num = parseFloat(val);
          return isNaN(num) ? `₹${val}` : `₹${num.toLocaleString('en-IN')}`;
        }
        return String(val ?? '-');
      })
    );
    blocks.push({ type: 'table', headers, rows });
  }

  return blocks;
}

export default function AIChatWidget() {
  const { isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: 'Hi! I am your AI Expense Assistant. Ask me anything about your expenses, or ask for a list of items to view in a clean table!',
    },
  ]);

  const messagesEndRef = useRef(null);

  // Auto scroll to bottom of chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Listen for mobile bottom bar toggle event
  useEffect(() => {
    const handler = () => setIsOpen((prev) => !prev);
    window.addEventListener('toggle-ai-chat', handler);
    return () => window.removeEventListener('toggle-ai-chat', handler);
  }, []);

  if (!isAuthenticated) return null;

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const userQuestion = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { sender: 'user', text: userQuestion }]);
    setLoading(true);

    try {
      const response = await authFetch(ASK_AI_URL, {
        method: 'POST',
        body: JSON.stringify({ question: userQuestion }),
      });

      const data = await response.json();

      if (response.ok && data.answer) {
        setMessages((prev) => [
          ...prev,
          { sender: 'ai', text: data.answer, tableData: data.tableData },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'ai',
            text: data.error || 'Sorry, I encountered an issue retrieving the response.',
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: 'Unable to reach backend or Ollama. Ensure Ollama and backend are running.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const sampleQuestions = [
    'Nov ke expenses dikhao (List)',
    'Food expenses list',
    'Category wise spending',
    'How much did I spend in October?',
  ];

  return (
    <div className="fixed bottom-20 right-3 sm:bottom-6 sm:right-6 z-50">
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-full shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200 font-medium text-xs sm:text-sm"
          title="Chat with AI Expense Assistant"
        >
          <span className="text-lg sm:text-xl">🤖</span>
          <span className="hidden xs:inline">Ask AI Assistant</span>
          <span className="xs:hidden">Ask AI</span>
          <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-[calc(100vw-24px)] sm:w-[460px] max-w-[460px] h-[78vh] sm:h-[560px] max-h-[640px] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-3.5 sm:p-4 text-white flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/20 flex items-center justify-center text-base sm:text-lg backdrop-blur-sm">
                🤖
              </div>
              <div>
                <h3 className="font-semibold text-xs sm:text-sm leading-tight">Expense AI Assistant</h3>
                <span className="text-[11px] text-blue-100 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                  Local AI Assistant
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Quick Prompts */}
          {messages.length <= 2 && (
            <div className="bg-blue-50/70 border-b border-blue-100 p-2.5 flex flex-wrap gap-1.5 text-xs">
              <span className="text-gray-500 font-medium mr-1 self-center">Try:</span>
              {sampleQuestions.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setInput(q);
                  }}
                  className="bg-white border border-blue-200 text-blue-700 px-2.5 py-1 rounded-full hover:bg-blue-100 transition-colors text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Message List */}
          <div className="flex-1 p-3.5 sm:p-4 overflow-y-auto space-y-3 bg-gray-50/60 text-sm">
            {messages.map((m, i) => {
              const isUser = m.sender === 'user';
              const blocks = !isUser ? parseMessageBlocks(m.text, m.tableData) : [];

              return (
                <div
                  key={i}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 shadow-xs leading-relaxed ${
                      isUser
                        ? 'max-w-[85%] bg-blue-600 text-white rounded-br-none whitespace-pre-wrap'
                        : 'w-full max-w-[96%] sm:max-w-[92%] bg-white text-gray-800 border border-gray-100 rounded-bl-none'
                    }`}
                  >
                    {isUser ? (
                      m.text
                    ) : (
                      <div className="space-y-2">
                        {blocks.map((block, bIdx) => {
                          if (block.type === 'table') {
                            return (
                              <TableBlock
                                key={bIdx}
                                headers={block.headers}
                                rows={block.rows}
                              />
                            );
                          }
                          return (
                            <div key={bIdx} className="whitespace-pre-wrap text-xs sm:text-sm">
                              <FormattedInlineText text={block.content} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex items-center gap-2 text-gray-500 text-xs">
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-bounce"></span>
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:0.2s]"></span>
                  <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:0.4s]"></span>
                  <span>Analyzing expenses...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <form onSubmit={handleSend} className="p-3 bg-white border-t border-gray-100 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything (e.g. 'Nov ke expenses list')..."
              className="flex-1 p-2.5 border border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 text-sm"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-blue-600 text-white px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-blue-700 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-sm"
            >
              Send
            </button>
          </form>

        </div>
      )}
    </div>
  );
}

