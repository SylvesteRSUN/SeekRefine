import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, Trash2, Play, Loader2, Sparkles, Check, X, Pencil, Users, LinkIcon } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { MatchScoreBadge, StatusBadge } from '../components/ui/Badge';
import { useJobStore } from '../stores/jobStore';
import { useResumeStore } from '../stores/resumeStore';
import { generateApi, jobApi } from '../services/api';
import type { SearchSuggestion } from '../services/api';

interface ProfileFormState {
  name: string;
  keywords: string;
  location: string;
  remote_type: string;
  experience_level: string;
  date_posted: string;
  sort_by: string;
  max_applicants: string;
  exclude_keywords: string;
}

const emptyForm: ProfileFormState = {
  name: '', keywords: '', location: '', remote_type: '', experience_level: '',
  date_posted: '', sort_by: '', max_applicants: '', exclude_keywords: '',
};

function formToPayload(form: ProfileFormState) {
  return {
    name: form.name,
    keywords: form.keywords,
    location: form.location || null,
    remote_type: form.remote_type || null,
    experience_level: form.experience_level || null,
    date_posted: form.date_posted || null,
    sort_by: form.sort_by || null,
    max_applicants: form.max_applicants ? parseInt(form.max_applicants, 10) : null,
    exclude_keywords: form.exclude_keywords
      ? form.exclude_keywords.split(',').map((s) => s.trim()).filter(Boolean)
      : null,
  };
}

function ExperienceSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Any Level</option>
      <option value="internship">Internship</option>
      <option value="entry">Entry Level</option>
      <option value="associate">Associate</option>
      <option value="mid-senior">Mid-Senior</option>
      <option value="director">Director</option>
      <option value="executive">Executive</option>
    </select>
  );
}

function RemoteSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Any</option>
      <option value="remote">Remote</option>
      <option value="onsite">On-site</option>
      <option value="hybrid">Hybrid</option>
    </select>
  );
}

function DatePostedSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Any Time</option>
      <option value="24h">Past 24 Hours</option>
      <option value="week">Past Week</option>
      <option value="month">Past Month</option>
    </select>
  );
}

function SortSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Most Relevant</option>
      <option value="recent">Most Recent</option>
    </select>
  );
}

/** Inline profile filter form fields (shared between create and edit) */
function ProfileFilterFields({ form, setForm }: { form: ProfileFormState; setForm: (f: ProfileFormState) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Profile Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., ML Engineer Europe" />
        <Input label="Keywords" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="e.g., machine learning engineer" />
        <Input label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g., Stockholm, Sweden" />
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Remote Type</label>
          <RemoteSelect value={form.remote_type} onChange={(v) => setForm({ ...form, remote_type: v })} />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Experience Level</label>
          <ExperienceSelect value={form.experience_level} onChange={(v) => setForm({ ...form, experience_level: v })} />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Date Posted</label>
          <DatePostedSelect value={form.date_posted} onChange={(v) => setForm({ ...form, date_posted: v })} />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Sort By</label>
          <SortSelect value={form.sort_by} onChange={(v) => setForm({ ...form, sort_by: v })} />
        </div>
        <Input
          label="Max Applicants"
          type="number"
          value={form.max_applicants}
          onChange={(e) => setForm({ ...form, max_applicants: e.target.value })}
          placeholder="e.g., 50"
        />
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Exclude Keywords (comma-separated)</label>
        <input
          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          value={form.exclude_keywords}
          onChange={(e) => setForm({ ...form, exclude_keywords: e.target.value })}
          placeholder="e.g., Swedish, 5 years experience, Senior"
        />
        <p className="text-xs text-gray-400">Jobs whose description contains any of these words will be excluded</p>
      </div>
    </>
  );
}


export function JobList() {
  const {
    jobs, searchProfiles, scraping, analyzing,
    fetchJobs, fetchProfiles, createProfile, updateProfile, deleteProfile, deleteJob, updateJobStatus, runBatchSearches, batchAnalyze,
  } = useJobStore();
  const { resumes, fetchResumes } = useResumeStore();

  const [showNewProfile, setShowNewProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileFormState>({ ...emptyForm });
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<'match' | 'applicants'>('match');

  // AI suggestion state
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [suggestionLocation, setSuggestionLocation] = useState('');
  const [suggestionRemote, setSuggestionRemote] = useState('');
  const [suggestionDatePosted, setSuggestionDatePosted] = useState('week');
  const [suggestionMaxApplicants, setSuggestionMaxApplicants] = useState('50');
  const [suggestionExclude, setSuggestionExclude] = useState('');
  const [selectedResumeId, setSelectedResumeId] = useState('');

  // Profile selection state
  const [selectedProfileIds, setSelectedProfileIds] = useState<Set<string>>(new Set());

  // Edit profile state
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProfileFormState>({ ...emptyForm });

  // Scrape results
  const [lastResults, setLastResults] = useState<{ total_scraped: number; total_saved: number; results: Array<{ profile_name: string; scraped: number; new_saved: number; skipped_duplicate: number; skipped_filtered: number; status: string }> } | null>(null);

  // URL import
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);

  // Batch ignore by score
  const [ignoreThreshold, setIgnoreThreshold] = useState('50');

  // Job selection for batch delete
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());

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
    const excludeKw = suggestionExclude
      ? suggestionExclude.split(',').map((s) => s.trim()).filter(Boolean)
      : null;
    const maxApp = suggestionMaxApplicants ? parseInt(suggestionMaxApplicants, 10) : null;

    for (const idx of selectedSuggestions) {
      const s = suggestions[idx];
      if (!s) continue;
      await createProfile({
        name: s.name,
        keywords: s.keywords,
        location: suggestionLocation || null,
        remote_type: suggestionRemote || null,
        experience_level: s.experience_level || null,
        date_posted: suggestionDatePosted || null,
        sort_by: null,
        max_applicants: maxApp,
        exclude_keywords: excludeKw,
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
      date_posted: profile.date_posted || '',
      sort_by: profile.sort_by || '',
      max_applicants: profile.max_applicants?.toString() || '',
      exclude_keywords: profile.exclude_keywords?.join(', ') || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingProfileId || !editForm.name || !editForm.keywords) return;
    await updateProfile(editingProfileId, formToPayload(editForm));
    setEditingProfileId(null);
  };

  const handleCreateProfile = async () => {
    if (!profileForm.name || !profileForm.keywords) return;
    await createProfile(formToPayload(profileForm));
    setProfileForm({ ...emptyForm });
    setShowNewProfile(false);
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
    setLastResults(null);
    try {
      const result = await runBatchSearches(ids);
      setLastResults(result);
      fetchJobs();
      fetchProfiles();
    } catch {
      // error handled by store
    }
  };

  const handleAnalyzeUnscored = async () => {
    const resumeId = selectedResumeId || resumes[0]?.id;
    if (!resumeId) { alert('Please create a resume first'); return; }
    try {
      const result = await batchAnalyze(resumeId);
      alert(`Analyzed ${result.analyzed} unscored jobs`);
      fetchJobs();
    } catch { /* handled by store */ }
  };

  const handleAnalyzeSelected = async () => {
    const resumeId = selectedResumeId || resumes[0]?.id;
    if (!resumeId) { alert('Please create a resume first'); return; }
    const ids = [...selectedJobIds];
    if (ids.length === 0) return;
    try {
      const result = await batchAnalyze(resumeId, ids, false);
      alert(`Analyzed ${result.analyzed} jobs`);
      fetchJobs();
      setSelectedJobIds(new Set());
    } catch { /* handled by store */ }
  };

  const handleAnalyzeAll = async () => {
    const resumeId = selectedResumeId || resumes[0]?.id;
    if (!resumeId) { alert('Please create a resume first'); return; }
    if (!confirm(`Re-analyze all ${jobs.length} jobs? This may take a while.`)) return;
    try {
      const result = await batchAnalyze(resumeId, undefined, false);
      alert(`Analyzed ${result.analyzed} jobs`);
      fetchJobs();
    } catch { /* handled by store */ }
  };

  const handleBatchIgnore = async () => {
    const threshold = parseFloat(ignoreThreshold);
    if (isNaN(threshold) || threshold < 0 || threshold > 100) {
      alert('Please enter a valid percentage (0-100)');
      return;
    }
    const toIgnore = jobs.filter(
      (j) => j.status !== 'ignored' && j.status !== 'rejected' && j.match_score != null && j.match_score < threshold
    );
    if (toIgnore.length === 0) {
      alert('No jobs found below the threshold');
      return;
    }
    if (!confirm(`Ignore ${toIgnore.length} job(s) with match score below ${ignoreThreshold}%?`)) return;
    for (const j of toIgnore) {
      await updateJobStatus(j.id, 'ignored');
    }
    fetchJobs();
  };

  const handleImportUrl = async () => {
    const url = importUrl.trim();
    if (!url) return;
    setImporting(true);
    try {
      const { data } = await jobApi.importByUrl(url);
      setImportUrl('');
      fetchJobs();
      alert(`Imported: ${data.title} at ${data.company}`);
    } catch (err: any) {
      alert(`Import failed: ${err?.response?.data?.detail || err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const filteredJobs = jobs
    .filter((j) => {
      // Hide ignored/rejected jobs by default — only show when explicitly filtering
      if (!statusFilter && (j.status === 'ignored' || j.status === 'rejected')) return false;
      if (statusFilter && j.status !== statusFilter) return false;
      return true;
    })
    .filter((j) =>
      !searchText ||
      j.title.toLowerCase().includes(searchText.toLowerCase()) ||
      j.company.toLowerCase().includes(searchText.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'match') {
        return (b.match_score ?? -1) - (a.match_score ?? -1);
      }
      // applicants: ascending (fewer first), nulls at end
      const aCount = a.applicant_count ?? Infinity;
      const bCount = b.applicant_count ?? Infinity;
      return aCount - bCount;
    });

  const formatProfileTags = (profile: typeof searchProfiles[0]) => {
    const tags: string[] = [];
    if (profile.location) tags.push(profile.location);
    if (profile.remote_type) tags.push(profile.remote_type);
    if (profile.experience_level) tags.push(profile.experience_level);
    if (profile.date_posted) tags.push(`Posted: ${profile.date_posted}`);
    if (profile.max_applicants) tags.push(`<${profile.max_applicants} applicants`);
    if (profile.exclude_keywords?.length) tags.push(`Excludes: ${profile.exclude_keywords.join(', ')}`);
    return tags;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-gray-500 mt-1">{jobs.filter(j => j.status !== 'ignored').length} active jobs ({jobs.length} total)</p>
        </div>
        <div className="flex gap-2">
          {selectedJobIds.size > 0 && (
            <Button variant="primary" size="sm" onClick={handleAnalyzeSelected} disabled={analyzing}>
              {analyzing ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Sparkles size={14} className="mr-1" />}
              Analyze {selectedJobIds.size} Selected
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={handleAnalyzeUnscored} disabled={analyzing}>
            {analyzing ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Sparkles size={14} className="mr-1" />}
            Analyze Unscored
          </Button>
          <Button variant="ghost" size="sm" onClick={handleAnalyzeAll} disabled={analyzing}>
            Re-analyze All
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
          {/* Scrape Results */}
          {lastResults && (
            <div className="border border-green-200 bg-green-50/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-green-800">
                  Scrape Results: {lastResults.total_scraped} scraped, {lastResults.total_saved} new saved
                </h3>
                <button onClick={() => setLastResults(null)} className="text-green-400 hover:text-green-600">
                  <X size={16} />
                </button>
              </div>
              {lastResults.results.map((r, i) => (
                <p key={i} className="text-xs text-green-700">
                  <span className="font-medium">{r.profile_name}:</span>{' '}
                  {r.new_saved} new, {r.skipped_duplicate} duplicates skipped, {r.skipped_filtered} filtered out
                </p>
              ))}
            </div>
          )}

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
                  {/* Shared filters for all suggestions */}
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
                      <RemoteSelect value={suggestionRemote} onChange={setSuggestionRemote} />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-600">Date Posted</label>
                      <DatePostedSelect value={suggestionDatePosted} onChange={setSuggestionDatePosted} />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-600">Max Applicants</label>
                      <input
                        type="number"
                        className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                        value={suggestionMaxApplicants}
                        onChange={(e) => setSuggestionMaxApplicants(e.target.value)}
                        placeholder="e.g., 50"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-gray-600">Exclude Keywords (comma-separated)</label>
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                      value={suggestionExclude}
                      onChange={(e) => setSuggestionExclude(e.target.value)}
                      placeholder="e.g., Swedish, 5 years experience, Senior"
                    />
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

          {/* Manual create form */}
          {showNewProfile && (
            <div className="border border-blue-100 bg-blue-50/50 rounded-lg p-4 space-y-3">
              <ProfileFilterFields form={profileForm} setForm={setProfileForm} />
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
                  <div className="space-y-3">
                    <ProfileFilterFields form={editForm} setForm={setEditForm} />
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
                          Keywords: {profile.keywords}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {formatProfileTags(profile).map((tag, i) => (
                            <span key={i} className="text-xs px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">
                              {tag}
                            </span>
                          ))}
                          {profile.last_run_at && (
                            <span className="text-xs px-1.5 py-0.5 bg-blue-100 rounded text-blue-600">
                              Last run: {new Date(profile.last_run_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
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

      {/* Import by URL */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <LinkIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Paste LinkedIn job URL to import..."
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleImportUrl();
              }
            }}
          />
        </div>
        <Button
          size="sm"
          onClick={handleImportUrl}
          disabled={importing || !importUrl.trim()}
        >
          {importing ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Plus size={14} className="mr-1" />}
          {importing ? 'Importing...' : 'Import'}
        </Button>
      </div>

      {/* Filters & Job Actions */}
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
          <option value="">Active</option>
          <option value="new">New</option>
          <option value="interested">Interested</option>
          <option value="applied">Applied</option>
          <option value="ignored">Ignored</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'match' | 'applicants')}
        >
          <option value="match">Sort: Match Score</option>
          <option value="applicants">Sort: Fewest Applicants</option>
        </select>
        {selectedJobIds.size > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              if (!confirm(`Delete ${selectedJobIds.size} selected job(s)?`)) return;
              for (const jid of selectedJobIds) {
                await deleteJob(jid);
              }
              setSelectedJobIds(new Set());
            }}
          >
            <Trash2 size={14} className="mr-1 text-red-500" />
            Delete {selectedJobIds.size}
          </Button>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-gray-500 whitespace-nowrap">Ignore below</span>
          <input
            className="w-14 rounded-lg border border-gray-300 px-2 py-2 text-sm text-center"
            type="number"
            min="0"
            max="100"
            value={ignoreThreshold}
            onChange={(e) => setIgnoreThreshold(e.target.value)}
          />
          <span className="text-xs text-gray-500">%</span>
          <Button size="sm" variant="secondary" onClick={handleBatchIgnore}>
            <X size={14} className="mr-1" />
            Batch Ignore
          </Button>
        </div>
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
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={selectedJobIds.size === filteredJobs.length && filteredJobs.length > 0}
                    onChange={() => {
                      if (selectedJobIds.size === filteredJobs.length) {
                        setSelectedJobIds(new Set());
                      } else {
                        setSelectedJobIds(new Set(filteredJobs.map((j) => j.id)));
                      }
                    }}
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Job Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Company</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Location</th>
                <th
                  className="text-center px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-blue-600 select-none"
                  onClick={() => setSortBy('applicants')}
                >
                  <Users size={14} className="inline mr-1" />Applicants {sortBy === 'applicants' && '↑'}
                </th>
                <th
                  className="text-center px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-blue-600 select-none"
                  onClick={() => setSortBy('match')}
                >
                  Match {sortBy === 'match' && '↓'}
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="px-3 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => (
                <tr key={job.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${selectedJobIds.has(job.id) ? 'bg-blue-50/50' : ''}`}>
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selectedJobIds.has(job.id)}
                      onChange={() => {
                        setSelectedJobIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(job.id)) next.delete(job.id);
                          else next.add(job.id);
                          return next;
                        });
                      }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/jobs/${job.id}`} className="text-blue-600 hover:underline font-medium">
                      {job.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{job.company}</td>
                  <td className="px-4 py-3 text-gray-500">{job.location}</td>
                  <td className="px-4 py-3 text-center text-gray-500">
                    {job.applicant_count != null ? job.applicant_count : '-'}
                  </td>
                  <td className="px-4 py-3 text-center"><MatchScoreBadge score={job.match_score} /></td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={job.status} /></td>
                  <td className="px-3 py-3">
                    <button
                      className="text-gray-300 hover:text-red-500 transition-colors"
                      title="Delete"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${job.title}" at ${job.company}?`)) {
                          await deleteJob(job.id);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
