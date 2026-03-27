import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Trash2, MessageSquare } from 'lucide-react';
import { Button } from './ui/Button';
import { followUpApi, type FollowUpMessage } from '../services/api';

interface FollowUpChatProps {
  jobId: string;
  jobTitle: string;
  company: string;
}

export function FollowUpChat({ jobId, jobTitle, company }: FollowUpChatProps) {
  const [messages, setMessages] = useState<FollowUpMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages();
  }, [jobId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadMessages = async () => {
    setLoadingHistory(true);
    try {
      const { data } = await followUpApi.getMessages(jobId);
      setMessages(data);
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;

    // Optimistic: show user message immediately
    const tempUserMsg: FollowUpMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMsg]);
    setInput('');
    setLoading(true);

    try {
      const { data } = await followUpApi.sendMessage(jobId, text);
      // Replace temp message and add assistant reply (reload from server for correct IDs)
      await loadMessages();
    } catch (err: any) {
      const errorMsg: FollowUpMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${err?.response?.data?.detail || err.message}`,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('Clear all follow-up chat history for this job?')) return;
    try {
      await followUpApi.clearMessages(jobId);
      setMessages([]);
    } catch {
      // ignore
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm" style={{ height: '500px' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-purple-600" />
          <h3 className="font-semibold text-sm">Application Follow-Up</h3>
          <span className="text-xs text-gray-400">
            {company} - {jobTitle}
          </span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            className="text-gray-300 hover:text-red-500 transition-colors"
            title="Clear chat history"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {loadingHistory ? (
          <div className="text-center text-gray-400 text-sm py-8">
            <Loader2 size={16} className="animate-spin inline mr-2" />
            Loading chat history...
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8 space-y-2">
            <MessageSquare size={32} className="mx-auto text-gray-200" />
            <p>No follow-up messages yet.</p>
            <p className="text-xs">
              Paste HR messages here to get help drafting replies,
              prepare for interviews, or compose follow-up emails.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot size={14} className="text-purple-600" />
                </div>
              )}
              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-50 text-gray-700'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User size={14} className="text-gray-600" />
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0">
              <Bot size={14} className="text-purple-600" />
            </div>
            <div className="bg-gray-50 rounded-xl px-3.5 py-2.5 text-sm text-gray-400 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste HR message, ask for help drafting a reply, or prepare for interview..."
            className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent min-h-[40px] max-h-[120px]"
            rows={1}
            disabled={loading}
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={loading || !input.trim()}
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
