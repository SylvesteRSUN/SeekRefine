import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Trash2, Play, Loader2, Sparkles, Check, X, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { MatchScoreBadge, StatusBadge } from '../components/ui/Badge';
import { useJobStore } from '../stores/jobStore';
import { useResumeStore } from '../stores/resumeStore';
import { generateApi } from '../services/api';
import type { SearchSuggestion } from '../services/api';

export function JobList() {
  const {
    jobs, searchProfiles, scraping, analyzing,
    fetchJobs, fetchProfiles, createProfile, updateProfile, deleteProfile, runSearch, runBatchSearches, batchAnalyze,
  } = useJobStore();
  const { resumes, fetchResumes } = useResumeStore();

  const [showNewProfile, setShowNewProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', keywords: '', location: '', remote_type: '', experience_level: '' });
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchText, setSearchText] = useState('');

  // AI suggestion state
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [suggestionLocation, setSuggestionLocation] = useState('');
  const [suggestionRemote, setSuggestionRemote] = useState('');
  const [selectedResumeId, setSelectedResumeId] = useState('');

  // Profile selection state
  const [selectedProfileIds, setSelectedProfileIds] = useState<Set<string>>(new Set());

  // Edit profile state
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', keywords: '', location: '', remote_type: '', experience_level: '' });

  useEffect(() => {
    fetchJobs();
    fetchProfiles();
    fetchResumes();
  }, []);

  const handleAISuggest = async () => {
    const resumeId = selectedResumeId || resumes[0]?.id;
    if (!resumeId) {
      alert('Please create a resume first');
      return;
    }
    setSuggesting(true);
    setSuggestions([]);
    setSelectedSuggestions(new Set());
    try {
      const { data } = await generateApi.suggestSearches(resumeId);
      setSuggestions(data.suggestions);
      // Select all by default
      setSelectedSuggestions(new Set(data.suggestions.map((_, i) => i)));
    } catch (err: any) {
      alert(`AI suggestion failed: ${err?.response?.data?.detail || err.message}`);
    } finally {
      setSuggesting(false);
    }
  };

  const toggleSuggestion = (idx: number) => {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleCreateFromSuggestions = async () => {
    for (const idx of selectedSuggestions) {
      const s = suggestions[idx];
      if (!s) continue;
      await createProfile({
        name: s.name,
        keywords: s.keywords,
        location: suggestionLocation || null,
        remote_type: suggestionRemote || null,
        experience_level: s.experience_level || null,
      });
    }
    setSuggestions([]);
    setSelectedSuggestions(new Set());
  };

  const startEditProfile = (profile: typeof searchProfiles[0]) => {
    setEditingProfileId(profile.id);
    setEditForm({
      name: profile.name,
      keywords: profile.keywords,
      location: profile.location || '',
      remote_type: profile.remote_type || '',
      experience_level: profile.experience_level || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingProfileId || !editForm.name || !editForm.keywords) return;
    await updateProfile(editingProfileId, {
      name: editForm.name,
      keywords: editForm.keywords,
      location: editForm.location || null,
      remote_type: editForm.remote_type || null,
      experience_level: editForm.experience_level || null,
    });
    setEditingProfileId(null);
  };

  const handleCreateProfile = async () => {
    if (!profileForm.name || !profileForm.keywords) return;
    await createProfile(profileForm);
    setProfileForm({ name: '', keywords: '', location: '', remote_type: '', experience_level: '' });
    setShowNewProfile(false);
  };

  const handleRunSearch = async (profileId: string) => {
    const result = await runSearch(profileId);
    alert(`Scraped ${result.scraped} jobs, ${result.new_saved} new saved`);
    fetchJobs();
  };

  const toggleProfileSelection = (id: string) => {
    setSelectedProfileIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllProfiles = () => {
    if (selectedProfileIds.size === searchProfiles.length) {
      setSelectedProfileIds(new Set());
    } else {
      setSelectedProfileIds(new Set(searchProfiles.map((p) => p.id)));
    }
  };

  const handleRunSelected = async () => {
    const ids = [...selectedProfileIds];
    if (ids.length === 0) return;
    try {
      const result = await runBatchSearches(ids);
      const summary = result.results
        .map((r: { profile_name: string; new_saved: number; status: string }) =>
          `${r.profile_name}: ${r.new_saved} new${r.status !== 'ok' ? ` (${r.status})` : ''}`
        )
        .join('\n');
      alert(`Total: ${result.total_scraped} scraped, ${result.total_saved} new saved\n\n${summary}`);
      fetchJobs();
      fetchProfiles();
    } catch {
      // error handled by store
    }
  };

  const handleBatchAnalyze = async () => {
    if (resumes.length === 0) {
      alert('Please create a resume first');
      return;
    }
    await batchAnalyze(resumes[0].id);
    fetchJobs();
  };

  const filteredJobs = jobs
    .filter((j) => !statusFilter || j.status === statusFilter)
    .filter((j) =>
      !searchText ||
      j.title.toLowerCase().includes(searchText.toLowerCase()) ||
      j.company.toLowerCase().includes(searchText.toLowerCase())
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-gray-500 mt-1">{jobs.length} jobs found</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleBatchAnalyze} disabled={analyzing}>
            {analyzing ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
            Analyze All
          </Button>
        </div>
      </div>

      {/* Search Profiles */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h2 className="font-semibold">Search Profiles</h2>
          <div className="flex items-center gap-2">
            {resumes.length > 0 && (
              <select
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                value={selectedResumeId || resumes[0]?.id || ''}
                onChange={(e) => setSelectedResumeId(e.target.value)}
              >
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            )}
            <Button size="sm" onClick={handleAISuggest} disabled={suggesting || resumes.length === 0}>
              {suggesting ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Sparkles size={14} className="mr-1" />}
              {suggesting ? 'Analyzing...' : 'AI Generate'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowNewProfile(!showNewProfile)}>
              <Plus size={14} className="mr-1" /> Manual
            </Button>
            {searchProfiles.length > 0 && (
              <Button size="sm" variant="secondary" onClick={handleRunSelected} disabled={scraping || selectedProfileIds.size === 0}>
                {scraping ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Play size={14} className="mr-1" />}
                {scraping ? 'Scraping...' : selectedProfileIds.size > 0 ? `Run ${selectedProfileIds.size} Selected` : 'Run Selected'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* AI Suggestions panel */}
          {(suggesting || suggestions.length > 0) && (
            <div className="border border-purple-200 bg-purple-50/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-purple-800 flex items-center gap-1.5">
                  <Sparkles size={14} />
                  AI Suggested Search Profiles
                </h3>
                {suggestions.length > 0 && (
                  <button onClick={() => setSuggestions([])} className="text-purple-400 hover:text-purple-600">
                    <X size={16} />
                  </button>
                )}
              </div>

              {suggesting && (
                <p className="text-sm text-purple-600 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Analyzing your resume to suggest job searches...
                </p>
              )}

              {suggestions.length > 0 && (
                <>
                  {/* Location/remote for all suggestions */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-600">Location (for all)</label>
                      <input
                        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                        value={suggestionLocation}
                        onChange={(e) => setSuggestionLocation(e.target.value)}
                        placeholder="e.g., Stockholm, Sweden"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-600">Remote Type</label>
                      <select
                        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                        value={suggestionRemote}
                        onChange={(e) => setSuggestionRemote(e.target.value)}
                      >
                        <option value="">Any</option>
                        <option value="remote">Remote</option>
                        <option value="onsite">On-site</option>
                        <option value="hybrid">Hybrid</option>
                      </select>
                    </div>
                  </div>

                  {/* Suggestion list */}
                  <div className="space-y-2">
                    {suggestions.map((s, idx) => (
                      <label
                        key={idx}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedSuggestions.has(idx)
                            ? 'border-purple-300 bg-purple-100/50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedSuggestions.has(idx)}
                          onChange={() => toggleSuggestion(idx)}
                          className="mt-0.5 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{s.name}</span>
                            {s.experience_level && (
                              <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
                                {s.experience_level}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">Keywords: {s.keywords}</p>
                          <p className="text-xs text-purple-600 mt-0.5">{s.reasoning}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      {selectedSuggestions.size} of {suggestions.length} selected
                    </span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setSuggestions([])}>Cancel</Button>
                      <Button
                        size="sm"
                        onClick={handleCreateFromSuggestions}
                        disabled={selectedSuggestions.size === 0}
                      >
                        <Check size={14} className="mr-1" />
                        Create {selectedSuggestions.size} Profile{selectedSuggestions.size !== 1 ? 's' : ''}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {showNewProfile && (
            <div className="border border-blue-100 bg-blue-50/50 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Profile Name" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} placeholder="e.g., ML Engineer Europe" />
                <Input label="Keywords" value={profileForm.keywords} onChange={(e) => setProfileForm({ ...profileForm, keywords: e.target.value })} placeholder="e.g., machine learning engineer" />
                <Input label="Location" value={profileForm.location} onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })} placeholder="e.g., Stockholm, Sweden" />
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Remote Type</label>
                  <select className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" value={profileForm.remote_type} onChange={(e) => setProfileForm({ ...profileForm, remote_type: e.target.value })}>
                    <option value="">Any</option>
                    <option value="remote">Remote</option>
                    <option value="onsite">On-site</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreateProfile}>Create</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowNewProfile(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {searchProfiles.length === 0 && !showNewProfile ? (
            <p className="text-sm text-gray-400">No search profiles yet. Create one to start scraping.</p>
          ) : (
            <>
              {searchProfiles.length > 1 && (
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none px-1">
                  <input type="checkbox" className="rounded" checked={selectedProfileIds.size === searchProfiles.length} onChange={toggleAllProfiles} />
                  Select all
                </label>
              )}
            {searchProfiles.map((profile) => (
              <div key={profile.id} className="p-3 bg-gray-50 rounded-lg space-y-2">
                {editingProfileId === profile.id ? (
                  /* Inline edit form */
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Profile name" />
                      <input className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" value={editForm.keywords} onChange={(e) => setEditForm({ ...editForm, keywords: e.target.value })} placeholder="Keywords" />
                      <input className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} placeholder="Location" />
                      <select className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" value={editForm.remote_type} onChange={(e) => setEditForm({ ...editForm, remote_type: e.target.value })}>
                        <option value="">Any Remote</option>
                        <option value="remote">Remote</option>
                        <option value="onsite">On-site</option>
                        <option value="hybrid">Hybrid</option>
                      </select>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={handleSaveEdit}><Check size={14} className="mr-1" /> Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingProfileId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selectedProfileIds.has(profile.id)}
                        onChange={() => toggleProfileSelection(profile.id)}
                      />
                      <div>
                      <p className="font-medium text-sm">{profile.name}</p>
                      <p className="text-xs text-gray-500">
                        {profile.keywords} | {profile.location || 'Any location'}
                        {profile.remote_type && ` | ${profile.remote_type}`}
                        {profile.last_run_at && ` | Last run: ${new Date(profile.last_run_at).toLocaleDateString()}`}
                      </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => startEditProfile(profile)} title="Edit">
                        <Pencil size={14} className="text-gray-400" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteProfile(profile.id)} title="Delete">
                        <Trash2 size={14} className="text-red-400" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search jobs..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="new">New</option>
          <option value="interested">Interested</option>
          <option value="applied">Applied</option>
          <option value="ignored">Ignored</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Job List Table */}
      {filteredJobs.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-400">No jobs found. Create a search profile and run it to scrape jobs.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Job Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Company</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Location</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Match</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => (
                <tr key={job.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/jobs/${job.id}`} className="text-blue-600 hover:underline font-medium">
                      {job.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{job.company}</td>
                  <td className="px-4 py-3 text-gray-500">{job.location}</td>
                  <td className="px-4 py-3 text-center"><MatchScoreBadge score={job.match_score} /></td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={job.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
