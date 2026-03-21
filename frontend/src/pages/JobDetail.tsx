import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, FileText, Loader2, Download, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, MatchScoreBadge, StatusBadge } from '../components/ui/Badge';
import { useJobStore } from '../stores/jobStore';
import { useResumeStore } from '../stores/resumeStore';
import { generateApi } from '../services/api';

export function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentJob, fetchJob, updateJobStatus, analyzeMatch } = useJobStore();
  const { resumes, fetchResumes } = useResumeStore();

  const [analyzing, setAnalyzing] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [generatingCL, setGeneratingCL] = useState(false);
  const [coverLetter, setCoverLetter] = useState<string | null>(null);

  useEffect(() => {
    if (id) fetchJob(id);
    fetchResumes();
  }, [id]);

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
      await generateApi.tailorResume(resumeId, id);
      alert('Tailored resume created! Check your resume versions.');
    } finally {
      setTailoring(false);
    }
  };

  const handleGenerateCL = async () => {
    if (!resumeId || !id) return;
    setGeneratingCL(true);
    try {
      const { data } = await generateApi.coverLetter(resumeId, id);
      setCoverLetter(data.content);
    } finally {
      setGeneratingCL(false);
    }
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
        {/* Job Description */}
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

          {/* Cover Letter */}
          {coverLetter && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <h2 className="font-semibold">Generated Cover Letter</h2>
                <Button size="sm" variant="secondary" onClick={() => {
                  const blob = new Blob([coverLetter], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `CoverLetter_${currentJob.company}.txt`;
                  a.click();
                }}>
                  <Download size={14} className="mr-1" /> Download
                </Button>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
                  {coverLetter}
                </div>
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
