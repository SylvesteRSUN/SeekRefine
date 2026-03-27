import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, FileText, Loader2, Download, Sparkles, Trash2, ChevronDown, ChevronUp, Copy, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, MatchScoreBadge, StatusBadge } from '../components/ui/Badge';
import { useJobStore } from '../stores/jobStore';
import { useResumeStore } from '../stores/resumeStore';
import { generateApi, type TailoredResume } from '../services/api';
import api from '../services/api';
import { FollowUpChat } from '../components/FollowUpChat';

interface CoverLetterItem {
  id: string;
  content: string;
  style: string;
  created_at: string;
}

export function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentJob, fetchJob, updateJobStatus, deleteJob, analyzeMatch } = useJobStore();
  const { resumes, fetchResumes } = useResumeStore();

  const [analyzing, setAnalyzing] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [generatingCL, setGeneratingCL] = useState(false);

  // Previously generated items
  const [tailoredResumes, setTailoredResumes] = useState<TailoredResume[]>([]);
  const [coverLetters, setCoverLetters] = useState<CoverLetterItem[]>([]);
  const [expandedTailored, setExpandedTailored] = useState<string | null>(null);
  const [expandedCL, setExpandedCL] = useState<string | null>(null);
  const [showFollowUp, setShowFollowUp] = useState(false);

  useEffect(() => {
    if (id) fetchJob(id);
    fetchResumes();
  }, [id]);

  // Load existing tailored resumes and cover letters
  useEffect(() => {
    if (!id) return;
    loadCoverLetters();
  }, [id]);

  useEffect(() => {
    const resumeId = resumes[0]?.id;
    if (!resumeId) return;
    loadTailoredResumes(resumeId);
  }, [resumes]);

  const loadTailoredResumes = async (resumeId: string) => {
    try {
      const { data } = await api.get<TailoredResume[]>(`/resumes/${resumeId}/tailored`);
      // Filter to only show ones for this job
      setTailoredResumes(data.filter(t => t.job_id === id));
    } catch {
      // ignore
    }
  };

  const loadCoverLetters = async () => {
    try {
      const { data } = await api.get<CoverLetterItem[]>(`/jobs/${id}/cover-letters`);
      setCoverLetters(data);
    } catch {
      // ignore
    }
  };

  if (!currentJob) {
    return <p className="text-gray-400 text-center py-12">Loading...</p>;
  }

  const resumeId = resumes[0]?.id;

  const handleAnalyze = async () => {
    if (!resumeId || !id) return;
    setAnalyzing(true);
    try {
      await analyzeMatch(resumeId, id);
      fetchJob(id);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleTailor = async () => {
    if (!resumeId || !id) return;
    setTailoring(true);
    try {
      const { data } = await generateApi.tailorResume(resumeId, id);
      setTailoredResumes(prev => [data, ...prev]);
    } finally {
      setTailoring(false);
    }
  };

  const handleGenerateCL = async () => {
    if (!resumeId || !id) return;
    setGeneratingCL(true);
    try {
      const { data } = await generateApi.coverLetter(resumeId, id);
      const newCL: CoverLetterItem = {
        id: data.id,
        content: data.content,
        style: data.style,
        created_at: new Date().toISOString(),
      };
      setCoverLetters(prev => [newCL, ...prev]);
    } finally {
      setGeneratingCL(false);
    }
  };

  const handleExportTailoredLatex = async (tailoredId: string) => {
    try {
      const { data } = await api.get<{ latex_source: string; filename: string }>(
        `/resumes/tailored/${tailoredId}/export/latex`
      );
      const blob = new Blob([data.latex_source], { type: 'application/x-tex' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to export LaTeX');
    }
  };

  const handleDeleteTailored = async (tailoredId: string) => {
    if (!confirm('Delete this tailored resume version?')) return;
    try {
      await api.delete(`/resumes/tailored/${tailoredId}`);
      setTailoredResumes(prev => prev.filter(t => t.id !== tailoredId));
    } catch {
      alert('Failed to delete');
    }
  };

  const handleDownloadCL = (cl: CoverLetterItem) => {
    const blob = new Blob([cl.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CoverLetter_${currentJob.company}_${cl.style}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyCL = async (content: string) => {
    await navigator.clipboard.writeText(content);
  };

  const analysis = currentJob.match_analysis;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/jobs')}>
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{currentJob.title}</h1>
            <p className="text-gray-500 mt-1">
              {currentJob.company} {currentJob.location && `- ${currentJob.location}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <MatchScoreBadge score={currentJob.match_score} />
          <StatusBadge status={currentJob.status} />
          {currentJob.url && (
            <a href={currentJob.url} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm">
                <ExternalLink size={14} className="mr-1" /> LinkedIn
              </Button>
            </a>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (!id) return;
              if (confirm(`Delete this job?`)) {
                await deleteJob(id);
                navigate('/jobs');
              }
            }}
          >
            <Trash2 size={14} className="text-red-400" />
          </Button>
        </div>
      </div>

      {/* Status selector */}
      <div className="flex gap-2">
        {['new', 'interested', 'applied', 'ignored', 'rejected'].map((s) => (
          <Button
            key={s}
            variant={currentJob.status === s ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => id && updateJobStatus(id, s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job Description + Generated Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <h2 className="font-semibold">Job Description</h2>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700">
                {currentJob.description || 'No description available'}
              </div>
            </CardContent>
          </Card>

          {/* Tailored Resumes */}
          {tailoredResumes.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold">Tailored Resumes ({tailoredResumes.length})</h2>
              </CardHeader>
              <CardContent className="space-y-3">
                {tailoredResumes.map((tr) => (
                  <div key={tr.id} className="border border-gray-200 rounded-lg">
                    <div
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedTailored(expandedTailored === tr.id ? null : tr.id)}
                    >
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-blue-500" />
                        <span className="text-sm font-medium">{tr.changes_summary || 'Tailored version'}</span>
                        <span className="text-xs text-gray-400">
                          {new Date(tr.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); handleExportTailoredLatex(tr.id); }}
                          title="Export LaTeX"
                        >
                          <Download size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); handleDeleteTailored(tr.id); }}
                          title="Delete"
                        >
                          <Trash2 size={14} className="text-red-400" />
                        </Button>
                        {expandedTailored === tr.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                    </div>
                    {expandedTailored === tr.id && (
                      <div className="p-3 pt-0 border-t border-gray-100">
                        <div className="text-xs space-y-2 text-gray-600">
                          {/* Show selected projects */}
                          {tr.data.projects.length > 0 && (
                            <div>
                              <span className="font-semibold text-gray-700">Projects ({tr.data.projects.length}):</span>
                              <ul className="mt-1 space-y-1">
                                {tr.data.projects.map((p) => (
                                  <li key={p.id} className="flex items-start gap-1">
                                    <span className="text-blue-400 mt-0.5">-</span>
                                    <span><strong>{p.title}</strong> — {p.context}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {/* Show skills summary */}
                          {Object.keys(tr.data.skills).length > 0 && (
                            <div>
                              <span className="font-semibold text-gray-700">Skills:</span>{' '}
                              {Object.keys(tr.data.skills).join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Follow-Up Chat */}
          {showFollowUp && currentJob && (
            <FollowUpChat
              jobId={currentJob.id}
              jobTitle={currentJob.title}
              company={currentJob.company}
            />
          )}

          {/* Cover Letters */}
          {coverLetters.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold">Cover Letters ({coverLetters.length})</h2>
              </CardHeader>
              <CardContent className="space-y-3">
                {coverLetters.map((cl) => (
                  <div key={cl.id} className="border border-gray-200 rounded-lg">
                    <div
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedCL(expandedCL === cl.id ? null : cl.id)}
                    >
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-green-500" />
                        <span className="text-sm font-medium capitalize">{cl.style} Cover Letter</span>
                        <span className="text-xs text-gray-400">
                          {new Date(cl.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); handleCopyCL(cl.content); }}
                          title="Copy to clipboard"
                        >
                          <Copy size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); handleDownloadCL(cl); }}
                          title="Download"
                        >
                          <Download size={14} />
                        </Button>
                        {expandedCL === cl.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                    </div>
                    {expandedCL === cl.id && (
                      <div className="p-3 pt-0 border-t border-gray-100">
                        <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed max-h-96 overflow-y-auto">
                          {cl.content}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar: Actions & Analysis */}
        <div className="space-y-4">
          {/* Actions */}
          <Card>
            <CardHeader>
              <h2 className="font-semibold">Actions</h2>
            </CardHeader>
            <CardContent className="space-y-2">
              {!resumeId ? (
                <p className="text-sm text-gray-400">Create a resume first to use AI features</p>
              ) : (
                <>
                  <Button className="w-full justify-start" variant="secondary" onClick={handleAnalyze} disabled={analyzing}>
                    {analyzing ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />}
                    Analyze Match
                  </Button>
                  <Button className="w-full justify-start" variant="secondary" onClick={handleTailor} disabled={tailoring}>
                    {tailoring ? <Loader2 size={16} className="mr-2 animate-spin" /> : <FileText size={16} className="mr-2" />}
                    Tailor Resume
                  </Button>
                  <Button className="w-full justify-start" variant="secondary" onClick={handleGenerateCL} disabled={generatingCL}>
                    {generatingCL ? <Loader2 size={16} className="mr-2 animate-spin" /> : <FileText size={16} className="mr-2" />}
                    Generate Cover Letter
                  </Button>
                  <hr className="border-gray-100" />
                  <Button
                    className="w-full justify-start"
                    variant={showFollowUp ? 'primary' : 'secondary'}
                    onClick={() => setShowFollowUp(!showFollowUp)}
                  >
                    <MessageSquare size={16} className="mr-2" />
                    {showFollowUp ? 'Hide Follow-Up Chat' : 'Follow-Up Chat'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Match Analysis */}
          {analysis && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Match Analysis</h2>
                  <span className="text-2xl font-bold text-blue-600">{analysis.score}%</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {analysis.matching_points.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-green-600 uppercase mb-2">Matching Points</h4>
                    <ul className="space-y-1">
                      {analysis.matching_points.map((point, i) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                          <span className="text-green-500 mt-0.5">+</span> {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.gaps.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-red-600 uppercase mb-2">Gaps</h4>
                    <ul className="space-y-1">
                      {analysis.gaps.map((gap, i) => (
                        <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                          <span className="text-red-500 mt-0.5">-</span> {gap}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-semibold text-blue-600 uppercase mb-2">Recommendation</h4>
                  <p className="text-sm text-gray-700">{analysis.recommendation}</p>
                </div>

                {analysis.suggested_projects.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-purple-600 uppercase mb-2">Suggested Projects</h4>
                    <div className="flex flex-wrap gap-1">
                      {analysis.suggested_projects.map((proj, i) => (
                        <Badge key={i} variant="info">{proj}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Job Info */}
          <Card>
            <CardHeader>
              <h2 className="font-semibold">Details</h2>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {currentJob.remote_type && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Remote</span>
                  <span>{currentJob.remote_type}</span>
                </div>
              )}
              {currentJob.experience_level && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Level</span>
                  <span>{currentJob.experience_level}</span>
                </div>
              )}
              {currentJob.salary_range && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Salary</span>
                  <span>{currentJob.salary_range}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Scraped</span>
                <span>{new Date(currentJob.scraped_at).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
