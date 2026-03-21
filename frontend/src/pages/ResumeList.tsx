import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Upload, Trash2, FileText, Download, FileUp } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Input';
import { useResumeStore } from '../stores/resumeStore';
import type { ResumeData } from '../services/api';
import { resumeApi } from '../services/api';

const emptyResumeData: ResumeData = {
  personal_info: {
    first_name: '', last_name: '', address: '', phone: '', email: '', linkedin: '', github: '',
  },
  education: [],
  work_experience: [],
  projects: [],
  leadership: [],
  skills: {},
  languages: [],
};

export function ResumeList() {
  const navigate = useNavigate();
  const { resumes, loading, error, fetchResumes, createResume, deleteResume, importLatex, importFile } = useResumeStore();
  const [showImport, setShowImport] = useState(false);
  const [latexSource, setLatexSource] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchResumes();
  }, []);

  const handleCreate = async () => {
    const resume = await createResume('New Resume', emptyResumeData);
    navigate(`/resumes/${resume.id}`);
  };

  const handleImport = async () => {
    if (!latexSource.trim()) return;
    setImporting(true);
    try {
      const resume = await importLatex(latexSource);
      navigate(`/resumes/${resume.id}`);
    } catch {
      // error handled by store
    } finally {
      setImporting(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const resume = await importFile(file);
      navigate(`/resumes/${resume.id}`);
    } catch {
      // error handled by store
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const { data } = await resumeApi.exportLatex(id);
      const blob = new Blob([data.latex_source], { type: 'application/x-tex' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Resumes</h1>
          <p className="text-gray-500 mt-1">Manage your resume versions</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.tex,.txt"
            onChange={handleFileImport}
          />
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <FileUp size={16} className="mr-2" />
            {importing ? 'Importing...' : 'Import File'}
          </Button>
          <Button variant="secondary" onClick={() => setShowImport(!showImport)}>
            <Upload size={16} className="mr-2" />
            Import LaTeX
          </Button>
          <Button onClick={handleCreate}>
            <Plus size={16} className="mr-2" />
            New Resume
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Import LaTeX panel */}
      {showImport && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold">Import from LaTeX</h3>
            <p className="text-sm text-gray-500">Paste your moderncv LaTeX source code below. AI will parse it into structured data.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={latexSource}
              onChange={(e) => setLatexSource(e.target.value)}
              placeholder="Paste your .tex file content here..."
              rows={10}
              className="font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button onClick={handleImport} disabled={importing || !latexSource.trim()}>
                {importing ? 'Parsing with AI...' : 'Import'}
              </Button>
              <Button variant="ghost" onClick={() => setShowImport(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resume list */}
      {loading && resumes.length === 0 ? (
        <p className="text-gray-400 text-center py-12">Loading...</p>
      ) : resumes.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="mx-auto text-gray-300 mb-4" size={48} />
            <h3 className="text-lg font-medium text-gray-600">No resumes yet</h3>
            <p className="text-gray-400 mt-2">Create a new resume or import from LaTeX</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {resumes.map((resume) => (
            <Link key={resume.id} to={`/resumes/${resume.id}`}>
              <Card className="hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
                <CardContent className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <FileText className="text-blue-600" size={20} />
                    </div>
                    <div>
                      <p className="font-medium">{resume.name}</p>
                      <p className="text-xs text-gray-400">
                        Updated {new Date(resume.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleExport(resume.id, e)}
                      title="Export LaTeX"
                    >
                      <Download size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (confirm('Delete this resume?')) deleteResume(resume.id);
                      }}
                    >
                      <Trash2 size={14} className="text-red-400" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
