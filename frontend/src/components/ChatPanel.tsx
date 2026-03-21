import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, X, Bot, User, Loader2, CheckCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { generateApi } from '../services/api';
import type { ChatMessage, ChatResponse } from '../services/api';

interface ChatPanelProps {
  resumeId: string;
  onResumeUpdated: () => void; // Called when chat modifies the resume
}

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  updatedSection?: string | null;
  fileName?: string;
}

export function ChatPanel({ resumeId, onResumeUpdated }: ChatPanelProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([
    {
      role: 'assistant',
      content: 'Hi! I can help you add or edit content in your resume. You can:\n\n' +
        '- Tell me about a new project or experience\n' +
        '- Upload a file (report, paper, etc.) for me to extract relevant info\n' +
        '- Ask me to improve existing descriptions\n\n' +
        'What would you like to add?',
    },
  ]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getHistory = (): ChatMessage[] => {
    return messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }));
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text && !file) return;

    const userMsg: DisplayMessage = {
      role: 'user',
      content: text || `(Uploaded file: ${file?.name})`,
      fileName: file?.name,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const currentFile = file;
    setFile(null);

    try {
      let response: { data: ChatResponse };

      if (currentFile) {
        // File upload path
        response = await generateApi.chatUpload(
          resumeId,
          text || `Please analyze this file and extract relevant resume content.`,
          getHistory(),
          currentFile
        );
      } else {
        // Text-only path
        response = await generateApi.chat(resumeId, text, getHistory());
      }

      const assistantMsg: DisplayMessage = {
        role: 'assistant',
        content: response.data.reply,
        updatedSection: response.data.updated_section,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // If resume was updated, notify parent to refresh
      if (response.data.updated_section) {
        onResumeUpdated();
      }
    } catch (err: any) {
      const errorMsg: DisplayMessage = {
        role: 'assistant',
        content: `Sorry, an error occurred: ${err?.response?.data?.detail || err.message}`,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Bot size={18} className="text-blue-600" />
        <h3 className="font-semibold text-sm">AI Resume Assistant</h3>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot size={14} className="text-blue-600" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-50 text-gray-700'
              }`}
            >
              {msg.fileName && (
                <div className={`text-xs mb-1.5 flex items-center gap-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                  <Paperclip size={10} /> {msg.fileName}
                </div>
              )}
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.updatedSection && (
                <div className="mt-2 pt-2 border-t border-green-200 flex items-center gap-1.5 text-xs text-green-600">
                  <CheckCircle size={12} />
                  Updated: {msg.updatedSection}
                </div>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User size={14} className="text-gray-600" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Bot size={14} className="text-blue-600" />
            </div>
            <div className="bg-gray-50 rounded-xl px-3.5 py-2.5 text-sm text-gray-400 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* File preview */}
      {file && (
        <div className="mx-4 mb-2 px-3 py-2 bg-blue-50 rounded-lg flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-blue-700">
            <Paperclip size={14} />
            <span className="truncate max-w-[200px]">{file.name}</span>
          </div>
          <button onClick={() => setFile(null)} className="text-blue-400 hover:text-blue-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".txt,.tex,.md,.pdf,.docx,.py,.java,.cpp,.c,.js,.ts,.json,.csv,.png,.jpg,.jpeg,.bmp,.tiff,.webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile(f);
              e.target.value = '';
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            title="Upload file"
          >
            <Paperclip size={16} />
          </Button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe a project, experience, or ask me to edit..."
            className="flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[40px] max-h-[120px]"
            rows={1}
            disabled={loading}
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={loading || (!input.trim() && !file)}
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
