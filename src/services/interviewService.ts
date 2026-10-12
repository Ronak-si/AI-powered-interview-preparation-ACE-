import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/integrations/firebase/client";

export type InterviewQuestion = { id: string; question: string; topic: string; hint?: string };
export type InterviewRecord = {
  id: string;
  user_id: string;
  role: string;
  difficulty: string;
  question_count: number;
  status: "in_progress" | "completed";
  questions: InterviewQuestion[];
  answers: Record<string, string>;
  evaluation: EvaluationResult | null;
  overall_score: number | null;
  technical_score: number | null;
  communication_score: number | null;
  problem_solving_score: number | null;
  duration_seconds: number;
  created_at: string;
  completed_at: string | null;
};

export type EvaluationResult = {
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  problemSolvingScore: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  perQuestion: { questionId: string; score: number; feedback: string; idealAnswer: string }[];
};

export async function listInterviews(): Promise<InterviewRecord[]> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to view your interviews.");
  const result = await getDocs(query(collection(db, "interviews"), where("user_id", "==", user.uid)));
  return result.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as InterviewRecord)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getInterview(id: string): Promise<InterviewRecord | null> {
  const snapshot = await getDoc(doc(db, "interviews", id));
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as InterviewRecord) : null;
}

export function summarise(interviews: InterviewRecord[]) {
  const completed = interviews.filter((i) => i.status === "completed" && i.overall_score !== null);
  const scores = completed.map((i) => Number(i.overall_score));
  const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const best = scores.length ? Math.round(Math.max(...scores)) : null;
  return {
    total: interviews.length,
    completed: completed.length,
    inProgress: interviews.length - completed.length,
    average,
    best,
    practiceMinutes: Math.round(interviews.reduce((acc, i) => acc + (i.duration_seconds ?? 0), 0) / 60),
    trend: [...completed].reverse().map((i, index) => ({
      name: `#${index + 1}`, score: Math.round(Number(i.overall_score)), date: i.completed_at ?? i.created_at, role: i.role,
    })),
  };
}
