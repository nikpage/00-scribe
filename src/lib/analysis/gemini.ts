import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export interface AnalysisResult {
  summary: string;
  keyTopics: string[];
  questionQuality: {
    openQuestions: number;
    closedQuestions: number;
    ratio: number; // open / total
  };
  empathyScore: number; // 1-5
  actionItems: string[];
  qualityScore: number; // 1-5 overall interview quality
  qualityNotes: string; // brief explanation of score
}

const ANALYSIS_PROMPT = `You are an expert in social work interview analysis. Analyze this interview transcript and return a JSON object with the following fields:

- "summary": 2-3 sentence summary of what was discussed
- "keyTopics": array of 3-6 key topics covered (short phrases)
- "questionQuality": { "openQuestions": number, "closedQuestions": number, "ratio": decimal 0-1 }
- "empathyScore": 1-5 rating of interviewer empathy/rapport (5 = excellent)
- "actionItems": array of follow-up actions identified (empty array if none)
- "qualityScore": 1-5 overall interview quality rating (5 = excellent)
- "qualityNotes": 1 sentence explaining the quality score

Consider these quality indicators:
- Does the interviewer use open-ended questions?
- Is there active listening (reflecting, summarising)?
- Does the client get adequate space to speak?
- Are sensitive topics handled appropriately?
- Are next steps or actions identified?

Return ONLY valid JSON, no markdown fences or extra text.`;

export async function analyzeTranscript(
  utterances: { speaker: string; text: string }[],
  speakers: Record<string, string>
): Promise<AnalysisResult> {
  const transcript = utterances
    .map((u) => {
      const name = speakers[u.speaker] || `Speaker ${u.speaker}`;
      return `${name}: ${u.text}`;
    })
    .join("\n");

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent([
    ANALYSIS_PROMPT,
    `\n\nTRANSCRIPT:\n${transcript}`,
  ]);

  const text = result.response.text().trim();
  // Strip markdown code fences if present
  const json = text.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(json) as AnalysisResult;
}
