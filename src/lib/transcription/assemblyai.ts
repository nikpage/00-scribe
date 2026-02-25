import { AssemblyAI } from "assemblyai";
import type { TranscriptionProvider, TranscriptionResult } from "./types";

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY!,
});

export const assemblyaiProvider: TranscriptionProvider = {
  async submit(audioUrl: string) {
    const transcript = await client.transcripts.transcribe({
      audio_url: audioUrl,
      language_code: "cs",
      speaker_labels: true,
      webhook_url: `${process.env.WEBAUTHN_ORIGIN}/api/webhook`,
    });
    return { id: transcript.id };
  },

  async getResult(id: string) {
    const transcript = await client.transcripts.get(id);
    if (transcript.status === "error") {
      return {
        id,
        status: "error" as const,
        utterances: [],
        error: transcript.error ?? "Unknown error",
      };
    }
    return {
      id,
      status: "completed" as const,
      utterances: (transcript.utterances ?? []).map((u) => ({
        speaker: u.speaker,
        text: u.text,
      })),
    };
  },

  async verifyWebhook(_request: Request) {
    // AssemblyAI webhook verification is done via the transcript ID
    return true;
  },

  async parseWebhook(request: Request) {
    const body = await request.json();
    const { transcript_id, status } = body;
    if (status === "error") {
      return {
        id: transcript_id,
        status: "error" as const,
        utterances: [],
        error: "Transcription failed",
      };
    }
    // Fetch the full transcript to get utterances
    return this.getResult(transcript_id);
  },
};
