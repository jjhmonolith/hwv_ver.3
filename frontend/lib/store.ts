import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ============================================
// Types
// ============================================

export interface Teacher {
  id: string;
  email: string;
  name: string;
}

export interface Session {
  id: string;
  title: string;
  description?: string;
  status: 'draft' | 'active' | 'closed';
  accessCode?: string;
  topicCount: number;
  topicDuration: number;
  interviewMode: 'voice' | 'chat' | 'student_choice';
  participantCount?: number;
  completedCount?: number;
  createdAt: string;
}

export interface Participant {
  id: string;
  sessionId: string;
  studentName: string;
  studentId?: string;
  status: ParticipantStatus;
  analyzedTopics?: Topic[];
  chosenInterviewMode?: string;
  summary?: EvaluationSummary;
}

export type ParticipantStatus =
  | 'registered'
  | 'file_submitted'
  | 'interview_in_progress'
  | 'completed'
  | 'abandoned';

export interface Topic {
  index: number;
  title: string;
  description: string;
}

export interface TopicState {
  index: number;
  title: string;
  totalTime: number;
  timeLeft: number;
  status: 'pending' | 'active' | 'done' | 'skipped';
  started: boolean;
}

export interface InterviewState {
  currentTopicIndex: number;
  currentPhase: InterviewPhase;
  topicsState: TopicState[];
  topicStartedAt?: string;
  firstQuestion?: string; // First question for TTS playback on interview start
}

export type InterviewPhase =
  | 'topic_intro'
  | 'topic_active'
  | 'topic_transition'
  | 'topic_expired_while_away'
  | 'finalizing'
  | 'completed';

export interface Message {
  role: 'ai' | 'student';
  content: string;
  timestamp: string;
}

export interface EvaluationSummary {
  score?: number;
  strengths: string[];
  weaknesses: string[];
  overallComment: string;
}

// ============================================
// Teacher Store
// ============================================

interface TeacherState {
  teacher: Teacher | null;
  token: string | null;
  sessions: Session[];

  // Actions
  setTeacher: (teacher: Teacher | null) => void;
  setToken: (token: string | null) => void;
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  updateSession: (id: string, updates: Partial<Session>) => void;
  removeSession: (id: string) => void;
  logout: () => void;
}

export const useTeacherStore = create<TeacherState>()(
  persist(
    (set) => ({
      teacher: null,
      token: null,
      sessions: [],

      setTeacher: (teacher) => set({ teacher }),
      setToken: (token) => set({ token }),
      setSessions: (sessions) => set({ sessions }),

      addSession: (session) =>
        set((state) => ({
          sessions: [session, ...state.sessions],
        })),

      updateSession: (id, updates) =>
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),

      removeSession: (id) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
        })),

      logout: () =>
        set({
          teacher: null,
          token: null,
          sessions: [],
        }),
    }),
    {
      name: 'teacher-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        teacher: state.teacher,
        token: state.token,
      }),
    }
  )
);

// ============================================
// Student Store
// ============================================

interface StudentState {
  participant: Participant | null;
  sessionToken: string | null;
  sessionInfo: {
    title: string;
    topicCount: number;
    topicDuration: number;
    interviewMode: 'voice' | 'chat' | 'student_choice';
  } | null;
  interviewState: InterviewState | null;
  messages: Message[];

  // Actions
  setParticipant: (participant: Participant | null) => void;
  setSessionToken: (token: string | null) => void;
  setSessionInfo: (info: StudentState['sessionInfo']) => void;
  setInterviewState: (state: InterviewState | null) => void;
  updateTopicTimeLeft: (topicIndex: number, timeLeft: number) => void;
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;
  clearSession: () => void;
}

// Hydration state for SSR/client sync
let studentStoreHydrated = false;

export const useStudentStore = create<StudentState>()(
  persist(
    (set) => ({
      participant: null,
      sessionToken: null,
      sessionInfo: null,
      interviewState: null,
      messages: [],

      setParticipant: (participant) => set({ participant }),
      setSessionToken: (sessionToken) => set({ sessionToken }),
      setSessionInfo: (sessionInfo) => set({ sessionInfo }),
      setInterviewState: (interviewState) => set({ interviewState }),

      updateTopicTimeLeft: (topicIndex, timeLeft) =>
        set((state) => {
          if (!state.interviewState) return state;
          const updatedTopicsState = state.interviewState.topicsState.map((topic) =>
            topic.index === topicIndex ? { ...topic, timeLeft } : topic
          );
          return {
            interviewState: {
              ...state.interviewState,
              topicsState: updatedTopicsState,
            },
          };
        }),

      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, message],
        })),

      setMessages: (messages) => set({ messages }),

      clearSession: () =>
        set({
          participant: null,
          sessionToken: null,
          sessionInfo: null,
          interviewState: null,
          messages: [],
        }),
    }),
    {
      name: 'student-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessionToken: state.sessionToken,
        participant: state.participant,
        sessionInfo: state.sessionInfo,
      }),
      onRehydrateStorage: () => {
        return () => {
          studentStoreHydrated = true;
        };
      },
    }
  )
);

// Helper to check if store is hydrated
export const isStudentStoreHydrated = () => studentStoreHydrated;

// ============================================
// UI Store (non-persisted)
// ============================================

interface UIState {
  isLoading: boolean;
  error: string | null;

  // Actions
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isLoading: false,
  error: null,

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));
