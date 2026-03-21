/**
 * Job state management with Zustand.
 */
import { create } from 'zustand';
import type { Job, JobListItem, SearchProfile, MatchAnalysis } from '../services/api';
import { jobApi, generateApi } from '../services/api';

interface JobStore {
  jobs: JobListItem[];
  currentJob: Job | null;
  searchProfiles: SearchProfile[];
  loading: boolean;
  scraping: boolean;
  analyzing: boolean;
  error: string | null;

  fetchJobs: (params?: { status?: string; min_score?: number }) => Promise<void>;
  fetchJob: (id: string) => Promise<void>;
  updateJobStatus: (id: string, status: string) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;

  fetchProfiles: () => Promise<void>;
  createProfile: (data: Omit<SearchProfile, 'id' | 'last_run_at' | 'created_at'>) => Promise<void>;
  updateProfile: (id: string, data: Partial<Pick<SearchProfile, 'name' | 'keywords' | 'location' | 'remote_type' | 'experience_level' | 'date_posted' | 'sort_by' | 'max_applicants' | 'exclude_keywords'>>) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  runSearch: (profileId: string) => Promise<{ scraped: number; new_saved: number }>;
  runBatchSearches: (profileIds: string[]) => Promise<{ total_scraped: number; total_saved: number }>;

  analyzeMatch: (resumeId: string, jobId: string) => Promise<MatchAnalysis>;
  batchAnalyze: (resumeId: string, jobIds?: string[], unscoredOnly?: boolean) => Promise<any>;

  clearError: () => void;
}

export const useJobStore = create<JobStore>((set) => ({
  jobs: [],
  currentJob: null,
  searchProfiles: [],
  loading: false,
  scraping: false,
  analyzing: false,
  error: null,

  fetchJobs: async (params) => {
    set({ loading: true, error: null });
    try {
      const { data } = await jobApi.list(params);
      set({ jobs: data, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchJob: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const { data } = await jobApi.get(id);
      set({ currentJob: data, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  updateJobStatus: async (id: string, status: string) => {
    try {
      const { data } = await jobApi.updateStatus(id, status);
      set((s) => ({
        currentJob: s.currentJob?.id === id ? data : s.currentJob,
        jobs: s.jobs.map((j) => (j.id === id ? { ...j, status } : j)),
      }));
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  deleteJob: async (id: string) => {
    try {
      await jobApi.delete(id);
      set((s) => ({
        jobs: s.jobs.filter((j) => j.id !== id),
        currentJob: s.currentJob?.id === id ? null : s.currentJob,
      }));
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  fetchProfiles: async () => {
    try {
      const { data } = await jobApi.listProfiles();
      set({ searchProfiles: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  createProfile: async (profileData) => {
    try {
      const { data } = await jobApi.createProfile(profileData);
      set((s) => ({ searchProfiles: [data, ...s.searchProfiles] }));
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  updateProfile: async (id, data) => {
    try {
      const { data: updated } = await jobApi.updateProfile(id, data);
      set((s) => ({
        searchProfiles: s.searchProfiles.map((p) => (p.id === id ? updated : p)),
      }));
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  deleteProfile: async (id: string) => {
    try {
      await jobApi.deleteProfile(id);
      set((s) => ({ searchProfiles: s.searchProfiles.filter((p) => p.id !== id) }));
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  runSearch: async (profileId: string) => {
    set({ scraping: true, error: null });
    try {
      const { data } = await jobApi.runSearch(profileId);
      set({ scraping: false });
      return data;
    } catch (e: any) {
      set({ error: e.message, scraping: false });
      throw e;
    }
  },

  runBatchSearches: async (profileIds: string[]) => {
    set({ scraping: true, error: null });
    try {
      const { data } = await jobApi.runBatchSearches(profileIds);
      set({ scraping: false });
      return data;
    } catch (e: any) {
      set({ error: e.message, scraping: false });
      throw e;
    }
  },

  analyzeMatch: async (resumeId: string, jobId: string) => {
    set({ analyzing: true, error: null });
    try {
      const { data } = await generateApi.matchAnalysis(resumeId, jobId);
      set({ analyzing: false });
      return data;
    } catch (e: any) {
      set({ error: e.message, analyzing: false });
      throw e;
    }
  },

  batchAnalyze: async (resumeId: string, jobIds?: string[], unscoredOnly?: boolean) => {
    set({ analyzing: true, error: null });
    try {
      const { data } = await generateApi.batchAnalyze(resumeId, jobIds, unscoredOnly);
      set({ analyzing: false });
      return data;
    } catch (e: any) {
      set({ error: e.message, analyzing: false });
      throw e;
    }
  },

  clearError: () => set({ error: null }),
}));
