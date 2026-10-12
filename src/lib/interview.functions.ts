import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";
import { createInterview, getInterviewDocument, updateInterview } from "@/integrations/firebase/firestore.server";
import { evaluateInterviewAnswers, generateInterviewQuestions } from "@/lib/interview.server";

/** Generates questions with AI and stores a new in-progress interview. */
export const generateInterview = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        role: z.string().min(2),
        difficulty: z.string().min(2),
        questionCount: z.number().int().min(3).max(20),
        focus: z.string().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const questions = await generateInterviewQuestions(data);

    if (questions.length === 0) {
      throw new Error("The AI returned no questions. Please try again.");
    }


    const id = await createInterview(context.firebaseToken, {
        id: crypto.randomUUID(),
        user_id: context.userId,
        role: data.role,
        difficulty: data.difficulty,
        question_count: questions.length,
        status: "in_progress",
        questions,
        answers: {},
        evaluation: null,
        overall_score: null,
        technical_score: null,
        communication_score: null,
        problem_solving_score: null,
        duration_seconds: 0,
        created_at: new Date().toISOString(),
        completed_at: null,
      });
    return { id };
  });

/** Scores the submitted answers with AI and completes the interview. */
export const evaluateInterview = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        interviewId: z.string().min(1),
        answers: z.record(z.string(), z.string()),
        durationSeconds: z.number().int().min(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const interview = await getInterviewDocument(context.firebaseToken, data.interviewId);
    if (interview.user_id !== context.userId) throw new Error("Interview not found.");

    const questions = (interview.questions ?? []) as {
      id: string;
      question: string;
      topic: string;
    }[];

    const transcript = questions
      .map(
        (q, i) =>
          `Q${i + 1} (id: ${q.id}, topic: ${q.topic}): ${q.question}\nAnswer: ${
            data.answers[q.id]?.trim() || "(no answer given)"
          }`,
      )
      .join("\n\n");

    const evaluation = await evaluateInterviewAnswers(
      `Role: ${interview.role}. Difficulty: ${interview.difficulty}.\n\n${transcript}\n\nEvaluate the candidate. Return one perQuestion entry per question using the exact question id, plus overall, technical, communication and problem solving scores, a 2-3 sentence summary, strengths, weaknesses and suggestions.`,
    );


    await updateInterview(context.firebaseToken, data.interviewId, {
        ...interview,
        status: "completed",
        answers: data.answers,
        evaluation,
        overall_score: Math.round(evaluation.overallScore),
        technical_score: Math.round(evaluation.technicalScore),
        communication_score: Math.round(evaluation.communicationScore),
        problem_solving_score: Math.round(evaluation.problemSolvingScore),
        duration_seconds: data.durationSeconds,
        completed_at: new Date().toISOString(),
      });
    return { ok: true };
  });
