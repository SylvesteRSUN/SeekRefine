/**
 * API client for SeekRefine backend.
 */
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// --- Resume APIs ---

export interface PersonalInfo {
  first_name: string;
  last_name: string;
  address: string;
  phone: string;
  email: string;
  linkedin: string;
  github: string;
}

export interface Education {
  id: string;
  dates: string;
  degree: string;
  track: string;
  school: string;
  location: string;
  grade: string;
  courses: string[];
  thesis: string | null;
  honors: string[];
}

export interface WorkExperience {
  id: string;
  dates: string;
  title: string;
  company: string;
  location: string;
  description: string;
}

export interface Project {
  id: string;
  dates: string;
  title: string;
  context: string;
  description: string;
  tags: string[];
}

export interface Leadership {
  id: string;
  dates: string;
  title: string;
  organization: string;
  parent_org: string;
  description: string;
}

export interface Language {
  language: string;
  level: string;
  detail: string;
}

export interface ResumeData {
  personal_info: PersonalInfo;
  education: Education[];
  work_experience: WorkExperience[];
  projects: Project[];
  leadership: Leadership[];
  skills: Record<string, string>;
  languages: Language[];
}

export interface Resume {
  id: string;
  name: string;
  data: ResumeData;
  created_at: string;
  updated_at: string;
}

export interface ResumeListItem {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export const resumeApi = {
  list: () => api.get<ResumeListItem[]>('/resumes/'),
  get: (id: string) => api.get<Resume>(`/resumes/${id}`),
  create: (name: string, data: ResumeData) =>
    api.post<Resume>('/resumes/', { name, data }),
  update: (id: string, payload: { name?: string; data?: ResumeData }) =>
    api.put<Resume>(`/resumes/${id}`, payload),
  updateSection: (id: string, section: string, data: unknown) =>
    api.patch<Resume>(`/resumes/${id}/section`, { section, data }),
  delete: (id: string) => api.delete(`/resumes/${id}`),
  exportLatex: (id: string) =>
    api.get<{ latex_source: string; filename: string }>(`/resumes/${id}/export/latex`),
  importLatex: (latex_source: string) =>
    api.post<Resume>('/resumes/import/latex', { latex_source }),
  importFile: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<Resume>('/resumes/import/file', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000,
    });
  },
};

// --- Job APIs ---

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  url: string | null;
  description: string | null;
  remote_type: string | null;
  experience_level: string | null;
  salary_range: string | null;
  match_score: number | null;
  match_analysis: MatchAnalysis | null;
  status: string;
  scraped_at: string;
  updated_at: string;
}

export interface JobListItem {
  id: string;
  title: string;
  company: string;
  location: string | null;
  applicant_count: number | null;
  match_score: number | null;
  status: string;
  scraped_at: string;
}

export interface SearchProfile {
  id: string;
  name: string;
  keywords: string;
  location: string | null;
  remote_type: string | null;
  experience_level: string | null;
  date_posted: string | null;
  sort_by: string | null;
  max_applicants: number | null;
  exclude_keywords: string[] | null;
  last_run_at: string | null;
  created_at: string;
}

export const jobApi = {
  list: (params?: { status?: string; min_score?: number }) =>
    api.get<JobListItem[]>('/jobs/', { params }),
  get: (id: string) => api.get<Job>(`/jobs/${id}`),
  updateStatus: (id: string, status: string) =>
    api.patch<Job>(`/jobs/${id}/status`, { status }),
  delete: (id: string) => api.delete(`/jobs/${id}`),
  listProfiles: () => api.get<SearchProfile[]>('/jobs/search-profiles'),
  createProfile: (data: Omit<SearchProfile, 'id' | 'last_run_at' | 'created_at'>) =>
    api.post<SearchProfile>('/jobs/search-profiles', data),
  updateProfile: (id: string, data: Partial<Pick<SearchProfile, 'name' | 'keywords' | 'location' | 'remote_type' | 'experience_level' | 'date_posted' | 'sort_by' | 'max_applicants' | 'exclude_keywords'>>) =>
    api.put<SearchProfile>(`/jobs/search-profiles/${id}`, data),
  deleteProfile: (id: string) => api.delete(`/jobs/search-profiles/${id}`),
  runSearch: (profileId: string) =>
    api.post<{ scraped: number; new_saved: number }>(`/jobs/search-profiles/${profileId}/run`),
  runBatchSearches: (profileIds: string[]) =>
    api.post<{ total_scraped: number; total_saved: number; results: Array<{ profile_name: string; scraped: number; new_saved: number; status: string }> }>('/jobs/search-profiles/run-batch', profileIds),
};

// --- Generate APIs ---

export interface MatchAnalysis {
  score: number;
  matching_points: string[];
  gaps: string[];
  recommendation: string;
  suggested_projects: string[];
}

export interface TailoredResume {
  id: string;
  resume_id: string;
  job_id: string | null;
  data: ResumeData;
  changes_summary: string | null;
  created_at: string;
}

export interface CoverLetter {
  id: string;
  content: string;
  style: string;
}

// --- Chat ---

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  reply: string;
  updated_section: string | null;
  updated_data: Record<string, unknown> | null;
}

export interface SearchSuggestion {
  name: string;
  keywords: string;
  experience_level: string | null;
  reasoning: string;
}

export const generateApi = {
  suggestSearches: (resume_id: string) =>
    api.post<{ suggestions: SearchSuggestion[] }>('/generate/suggest-searches', { resume_id }, { timeout: 600000 }),
  matchAnalysis: (resume_id: string, job_id: string) =>
    api.post<MatchAnalysis>('/generate/match-analysis', { resume_id, job_id }),
  tailorResume: (resume_id: string, job_id: string) =>
    api.post<TailoredResume>('/generate/tailor-resume', { resume_id, job_id }),
  coverLetter: (resume_id: string, job_id: string, style = 'professional') =>
    api.post<CoverLetter>('/generate/cover-letter', { resume_id, job_id, style }),
  batchAnalyze: (resume_id: string) =>
    api.post('/generate/batch-analyze', null, { params: { resume_id } }),
  chat: (resume_id: string, message: string, history: ChatMessage[], fileContent?: string, fileName?: string) =>
    api.post<ChatResponse>('/generate/chat', {
      resume_id, message, history,
      file_content: fileContent || null,
      file_name: fileName || null,
    }),
  chatUpload: (resume_id: string, message: string, history: ChatMessage[], file: File) => {
    const form = new FormData();
    form.append('resume_id', resume_id);
    form.append('message', message);
    form.append('history', JSON.stringify(history));
    form.append('file', file);
    return api.post<ChatResponse>('/generate/chat/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// --- LLM Config APIs ---

export interface LLMProvider {
  id: string;
  name: string;
  model: string;
  configured: boolean;
}

export interface LLMConfig {
  provider: string;
  model: string;
  available_providers: LLMProvider[];
}

export const llmApi = {
  getConfig: () => api.get<LLMConfig>('/llm/config'),
  updateConfig: (data: { provider?: string; model?: string; api_key?: string; base_url?: string; max_tokens?: number }) =>
    api.put<{ provider: string; model: string }>('/llm/config', data),
};

export default api;
