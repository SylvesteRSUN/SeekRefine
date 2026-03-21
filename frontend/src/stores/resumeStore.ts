/**
 * Resume state management with Zustand.
 */
import { create } from 'zustand';
import type { Resume, ResumeData, ResumeListItem } from '../services/api';
import { resumeApi } from '../services/api';

interface ResumeStore {
  // State
  resumes: ResumeListItem[];
  currentResume: Resume | null;
  loading: boolean;
  error: string | null;

  // Actions
  fetchResumes: () => Promise<void>;
  fetchResume: (id: string) => Promise<void>;
  createResume: (name: string, data: ResumeData) => Promise<Resume>;
  updateResume: (id: string, payload: { name?: string; data?: ResumeData }) => Promise<void>;
  updateSection: (id: string, section: string, data: unknown) => Promise<void>;
  deleteResume: (id: string) => Promise<void>;
  importLatex: (source: string) => Promise<Resume>;
  importFile: (file: File) => Promise<Resume>;
  clearError: () => void;
}

export const useResumeStore = create<ResumeStore>((set) => ({
  resumes: [],
  currentResume: null,
  loading: false,
  error: null,

  fetchResumes: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await resumeApi.list();
      set({ resumes: data, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchResume: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const { data } = await resumeApi.get(id);
      set({ currentResume: data, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  createResume: async (name: string, resumeData: ResumeData) => {
    set({ loading: true, error: null });
    try {
      const { data } = await resumeApi.create(name, resumeData);
      set((s) => ({ resumes: [data, ...s.resumes], loading: false }));
      return data;
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  updateResume: async (id: string, payload) => {
    set({ loading: true, error: null });
    try {
      const { data } = await resumeApi.update(id, payload);
      set({ currentResume: data, loading: false });
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  updateSection: async (id: string, section: string, sectionData: unknown) => {
    set({ error: null });
    try {
      const { data } = await resumeApi.updateSection(id, section, sectionData);
      set({ currentResume: data });
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  deleteResume: async (id: string) => {
    try {
      await resumeApi.delete(id);
      set((s) => ({
        resumes: s.resumes.filter((r) => r.id !== id),
        currentResume: s.currentResume?.id === id ? null : s.currentResume,
      }));
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  importLatex: async (source: string) => {
    set({ loading: true, error: null });
    try {
      const { data } = await resumeApi.importLatex(source);
      set((s) => ({ resumes: [data, ...s.resumes], currentResume: data, loading: false }));
      return data;
    } catch (e: any) {
      set({ error: e.message, loading: false });
      throw e;
    }
  },

  importFile: async (file: File) => {
    set({ loading: true, error: null });
    try {
      const { data } = await resumeApi.importFile(file);
      set((s) => ({ resumes: [data, ...s.resumes], currentResume: data, loading: false }));
      return data;
    } catch (e: any) {
      set({ error: e?.response?.data?.detail || e.message, loading: false });
      throw e;
    }
  },

  clearError: () => set({ error: null }),
}));
