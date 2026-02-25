export interface Utterance {
  speaker: string;
  text: string;
}

export interface TranscriptionResult {
  id: string;
  status: "completed" | "error";
  utterances: Utterance[];
  error?: string;
}

export interface TranscriptionProvider {
  submit(audioUrl: string): Promise<{ id: string }>;
  getResult(id: string): Promise<TranscriptionResult>;
  verifyWebhook(request: Request): Promise<boolean>;
  parseWebhook(request: Request): Promise<TranscriptionResult>;
}
