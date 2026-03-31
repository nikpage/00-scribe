import type { TranscriptionProvider } from "./types";
import { assemblyaiProvider } from "./assemblyai";
import { speechmaticsProvider } from "./speechmatics";

export function getProvider(): TranscriptionProvider {
  const provider = process.env.TRANSCRIPTION_PROVIDER ?? "assemblyai";
  switch (provider) {
    case "assemblyai":
      return assemblyaiProvider;
    case "speechmatics":
      return speechmaticsProvider;
    default:
      throw new Error(`Unknown transcription provider: ${provider}`);
  }
}
