import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Briefcase, Star, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useResumeStore } from '../stores/resumeStore';
import { useJobStore } from '../stores/jobStore';

export function Dashboard() {
  const { resumes, fetchResumes } = useResumeStore();
  const { jobs, fetchJobs } = useJobStore();

  useEffect(() => {
    fetchResumes();
    fetchJobs();
  }, []);

  const totalJobs = jobs.length;
  const highMatchJobs = jobs.filter((j) => j.match_score !== null && j.match_score >= 70);
  const appliedJobs = jobs.filter((j) => j.status === 'applied');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of your job search progress</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <FileText className="text-blue-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold">{resumes.length}</p>
              <p className="text-sm text-gray-500">Resumes</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="p-3 bg-purple-50 rounded-lg">
              <Briefcase className="text-purple-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalJobs}</p>
              <p className="text-sm text-gray-500">Jobs Found</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="p-3 bg-yellow-50 rounded-lg">
              <Star className="text-yellow-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold">{highMatchJobs.length}</p>
              <p className="text-sm text-gray-500">High Match (70%+)</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="p-3 bg-green-50 rounded-lg">
              <TrendingUp className="text-green-600" size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold">{appliedJobs.length}</p>
              <p className="text-sm text-gray-500">Applied</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardContent className="space-y-3">
          <h2 className="text-lg font-semibold">Quick Actions</h2>
          <div className="flex gap-3 flex-wrap">
            <Link to="/resumes">
              <Button variant="secondary">Manage Resumes</Button>
            </Link>
            <Link to="/jobs">
              <Button variant="secondary">Search Jobs</Button>
            </Link>
            {resumes.length > 0 && totalJobs > 0 && (
              <Link to="/jobs">
                <Button>Analyze All Jobs</Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent High-Match Jobs */}
      {highMatchJobs.length > 0 && (
        <Card>
          <CardContent className="space-y-3">
            <h2 className="text-lg font-semibold">Top Matches</h2>
            <div className="space-y-2">
              {highMatchJobs.slice(0, 5).map((job) => (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">{job.title}</p>
                    <p className="text-xs text-gray-500">{job.company} - {job.location}</p>
                  </div>
                  <span className="text-sm font-bold text-green-600">{job.match_score}%</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {resumes.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="mx-auto text-gray-300 mb-4" size={48} />
            <h3 className="text-lg font-medium text-gray-600">Get Started</h3>
            <p className="text-gray-400 mt-2 mb-4">
              Import your LaTeX resume or create a new one to begin
            </p>
            <Link to="/resumes">
              <Button>Go to Resumes</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
