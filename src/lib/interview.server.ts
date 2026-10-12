import { generateText } from "ai";
import { z } from "zod";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const GEMINI_MODEL = process.env["GEMINI_MODEL"] || "gemini-2.5-flash";

const QuestionsSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      topic: z.string(),
      hint: z.string().nullable(),
    }),
  ),
});

const EvaluationSchema = z.object({
  overallScore: z.number(),
  technicalScore: z.number(),
  communicationScore: z.number(),
  problemSolvingScore: z.number(),
  summary: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  suggestions: z.array(z.string()),
  perQuestion: z.array(
    z.object({
      questionId: z.string(),
      score: z.number(),
      feedback: z.string(),
      idealAnswer: z.string(),
    }),
  ),
});

type GenerateData = {
  role: string;
  difficulty: string;
  questionCount: number;
  focus?: string;
};

type Question = { id: string; question: string; topic: string; hint: string };

type Evaluation = z.infer<typeof EvaluationSchema>;

/** Returns a model bound to the server-side Gemini API key. */
function getModel() {
  const geminiKey = process.env["GEMINI_API_KEY"];
  if (geminiKey) {
    const google = createOpenAICompatible({
      name: "google",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: geminiKey,
    });
    return google(GEMINI_MODEL);
  }

  throw new Error("AI is not configured. Set GEMINI_API_KEY in the deployment environment.");
}

function extractJson(text: string | undefined): unknown {
  if (!text?.trim()) return null;
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeQuestions(value: unknown, count: number): Question[] {
  const root = asRecord(value);
  const source = Array.isArray(root?.questions) ? root.questions : Array.isArray(value) ? value : [];
  return source
    .map((item, index) => {
      const row = asRecord(item);
      const question = asString(row?.question ?? row?.text);
      if (!question) return null;
      return {
        id: `q${index + 1}`,
        question,
        topic: asString(row?.topic ?? row?.category, "General"),
        hint: asString(row?.hint ?? row?.tip, "Think through your answer step by step."),
      };
    })
    .filter((item): item is Question => item !== null)
    .slice(0, count);
}

function normalizeEvaluation(value: unknown): Evaluation | null {
  const parsed = EvaluationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function friendlyAiError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("429")) throw new Error("AI rate limit reached. Please retry in a moment.");
  throw new Error(message);
}

export async function generateInterviewQuestions(data: GenerateData) {
  try {
    const { text } = await generateText({
      model: getModel(),
      system:
        "You are a senior technical interviewer. Produce realistic, non-generic interview questions. Vary topics and never repeat a question. Return only valid JSON with no markdown or commentary.",
      prompt: `Create exactly ${data.questionCount} ${data.difficulty} interview questions for a ${data.role} role.${
        data.focus ? ` Focus areas: ${data.focus}.` : ""
      } Return this shape: {"questions":[{"question":"...","topic":"...","hint":"..."}]}. Every item must contain question, topic, and hint strings.`,
    });
    const questions = normalizeQuestions(extractJson(text), data.questionCount);
    if (questions.length === 0) {
      throw new Error("The AI returned no usable questions. Please generate the interview again.");
    }
    return questions;
  } catch (error) {
    friendlyAiError(error);
  }
}

export async function evaluateInterviewAnswers(prompt: string) {
  try {
    const { text } = await generateText({
      model: getModel(),
      system:
        "You are a strict but fair technical interview evaluator. Scores are 0-100 integers. Unanswered questions score 0. Be concrete and actionable. Return only valid JSON with no markdown or commentary.",
      prompt: `${prompt}\n\nReturn exactly this shape: {"overallScore":0,"technicalScore":0,"communicationScore":0,"problemSolvingScore":0,"summary":"...","strengths":["..."],"weaknesses":["..."],"suggestions":["..."],"perQuestion":[{"questionId":"q1","score":0,"feedback":"...","idealAnswer":"..."}]}.`,
    });
    const evaluation = normalizeEvaluation(extractJson(text));
    if (!evaluation) {
      throw new Error("The AI returned incomplete feedback. Please submit the interview again.");
    }
    return evaluation;
  } catch (error) {
    friendlyAiError(error);
  }
}
