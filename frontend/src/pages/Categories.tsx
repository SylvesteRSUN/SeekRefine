import { useEffect, useState } from 'react';
import { Tags, Plus, Trash2, Loader2, Sparkles, Wand2, Download, Check, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { CATEGORY_COLORS, CategoryBadge } from '../components/ui/Badge';
import { useResumeStore } from '../stores/resumeStore';
import { categoryApi } from '../services/api';
import type { JobCategory, CategorySuggestion } from '../services/api';

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const dot: Record<string, string> = {
    blue: 'bg-blue-500', green: 'bg-green-500', purple: 'bg-purple-500', orange: 'bg-orange-500',
    pink: 'bg-pink-500', teal: 'bg-teal-500', red: 'bg-red-500', indigo: 'bg-indigo-500',
  };
  return (
    <div className="flex items-center gap-1.5">
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-5 h-5 rounded-full ${dot[c]} ${value === c ? 'ring-2 ring-offset-1 ring-gray-700' : 'opacity-60 hover:opacity-100'}`}
          title={c}
        />
      ))}
    </div>
  );
}

export function Categories() {
  const { resumes, fetchResumes } = useResumeStore();
  const [categories, setCategories] = useState<JobCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');

  // suggestion state
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([]);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const { data } = await categoryApi.list();
      setCategories(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchResumes();
  }, []);

  useEffect(() => {
    if (!selectedResumeId && resumes.length > 0) setSelectedResumeId(resumes[0].id);
  }, [resumes, selectedResumeId]);

  const addBlank = async () => {
    await categoryApi.create({ name: 'New Category', color: 'blue', description: '', base_resume_id: selectedResumeId || null });
    fetchCategories();
  };

  const saveField = async (id: string, patch: Partial<JobCategory>) => {
    await categoryApi.update(id, patch as any);
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete category "${name}"? Jobs tagged with it will become uncategorized.`)) return;
    await categoryApi.delete(id);
    fetchCategories();
  };

  const generate = async (id: string) => {
    setBusyId(id);
    try {
      const { data } = await categoryApi.generateResume(id);
      setCategories((prev) => prev.map((c) => (c.id === id ? data : c)));
      alert('Category resume generated.');
    } catch (err: any) {
      alert(`Generation failed: ${err?.response?.data?.detail || err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const exportLatex = async (id: string) => {
    try {
      const { data } = await categoryApi.exportLatex(id);
      const blob = new Blob([data.latex_source], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export failed: ${err?.response?.data?.detail || err.message}`);
    }
  };

  const handleSuggest = async () => {
    if (!selectedResumeId) { alert('Create a resume first'); return; }
    setSuggesting(true);
    setSuggestions([]);
    try {
      const { data } = await categoryApi.suggest(selectedResumeId);
      setSuggestions(data.suggestions);
    } catch (err: any) {
      alert(`Suggestion failed: ${err?.response?.data?.detail || err.message}`);
    } finally {
      setSuggesting(false);
    }
  };

  const acceptSuggestion = async (s: CategorySuggestion) => {
    await categoryApi.create({ name: s.name, color: s.color, description: s.description, base_resume_id: selectedResumeId || null });
    setSuggestions((prev) => prev.filter((x) => x !== s));
    fetchCategories();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tags className="text-blue-600" />
          <h1 className="text-2xl font-bold">Job Categories</h1>
        </div>
        <div className="flex items-center gap-2">
          {resumes.length > 0 && (
            <select
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              value={selectedResumeId}
              onChange={(e) => setSelectedResumeId(e.target.value)}
              title="Base resume used for AI suggestions and resume generation"
            >
              {resumes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
          <Button size="sm" onClick={handleSuggest} disabled={suggesting || resumes.length === 0}>
            {suggesting ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Sparkles size={14} className="mr-1" />}
            {suggesting ? 'Thinking...' : 'Suggest Categories'}
          </Button>
          <Button size="sm" variant="secondary" onClick={addBlank}>
            <Plus size={14} className="mr-1" /> New
          </Button>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        Pre-tailor a resume for each broad job type. When you analyze jobs, the AI tags each one into the best-fit
        category — so you can apply with a ready-made resume and only hand-tailor the standout roles.
      </p>

      {/* AI suggestions */}
      {suggestions.length > 0 && (
        <Card className="border-purple-200">
          <CardHeader className="flex flex-row items-center justify-between bg-purple-50/50">
            <h2 className="font-semibold text-purple-800">Suggested Categories</h2>
            <button onClick={() => setSuggestions([])} className="text-purple-400 hover:text-purple-600"><X size={16} /></button>
          </CardHeader>
          <CardContent className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg p-3">
                <div className="flex-1">
                  <CategoryBadge name={s.name} color={s.color} />
                  <p className="text-xs text-gray-500 mt-1">{s.description}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => acceptSuggestion(s)}>
                  <Check size={14} className="mr-1" /> Add
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Category cards */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>
      ) : categories.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-gray-400">
            No categories yet. Click "Suggest Categories" to let AI propose some, or "New" to add one manually.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {categories.map((c) => (
            <Card key={c.id}>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <input
                    className="font-semibold text-gray-900 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none flex-1"
                    value={c.name}
                    onChange={(e) => setCategories((prev) => prev.map((x) => x.id === c.id ? { ...x, name: e.target.value } : x))}
                    onBlur={(e) => saveField(c.id, { name: e.target.value })}
                  />
                  <button onClick={() => remove(c.id, c.name)} className="text-gray-300 hover:text-red-500" title="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <ColorPicker value={c.color} onChange={(color) => saveField(c.id, { color })} />
                  <CategoryBadge name={c.name} color={c.color} />
                </div>

                <textarea
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                  rows={3}
                  placeholder="Description — what roles belong here & what the resume should emphasize (used for both classification and tailoring)"
                  value={c.description || ''}
                  onChange={(e) => setCategories((prev) => prev.map((x) => x.id === c.id ? { ...x, description: e.target.value } : x))}
                  onBlur={(e) => saveField(c.id, { description: e.target.value })}
                />

                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 whitespace-nowrap">Base resume</label>
                  <select
                    className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    value={c.base_resume_id || ''}
                    onChange={(e) => saveField(c.id, { base_resume_id: e.target.value || null })}
                  >
                    <option value="">(none)</option>
                    {resumes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={() => generate(c.id)} disabled={busyId === c.id || !c.base_resume_id}>
                    {busyId === c.id ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Wand2 size={14} className="mr-1" />}
                    {c.has_resume ? 'Regenerate' : 'Generate Resume'}
                  </Button>
                  {c.has_resume && (
                    <Button size="sm" variant="secondary" onClick={() => exportLatex(c.id)}>
                      <Download size={14} className="mr-1" /> Export .tex
                    </Button>
                  )}
                  {c.has_resume && <span className="text-xs text-green-600 flex items-center"><Check size={12} className="mr-0.5" />resume ready</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
