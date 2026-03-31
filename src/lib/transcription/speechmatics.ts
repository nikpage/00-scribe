import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import type { TranscriptionProvider } from "./types";

// ffmpeg-static provides the path to a statically-linked ffmpeg binary
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegPath: string = require("ffmpeg-static");

const API_BASE = "https://asr.api.speechmatics.com/v2";

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.SPEECHMATICS_API_KEY!}`,
  };
}

export const speechmaticsProvider: TranscriptionProvider = {
  async submit(audioUrl: string, options?: { speakersExpected?: number; languageCode?: string }) {
    // 1. Download audio from signed URL
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      throw new Error(`Failed to download audio (${audioRes.status})`);
    }
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    const contentType = audioRes.headers.get("content-type") || "";

    // 2. Convert to OGG if not already in a supported format
    //    Supported: wav, mp3, aac, ogg, mpeg, amr, m4a, mp4, flac
    const needsConversion = contentType.includes("webm") ||
      (!contentType.includes("ogg") &&
       !contentType.includes("wav") &&
       !contentType.includes("mp3") &&
       !contentType.includes("flac") &&
       !contentType.includes("mp4") &&
       !contentType.includes("m4a") &&
       !contentType.includes("aac") &&
       !contentType.includes("mpeg") &&
       !contentType.includes("amr"));

    let finalBuffer: Buffer;
    let finalMimeType: string;
    let finalFilename: string;

    if (needsConversion) {
      const id = randomUUID();
      const tmpIn = join(tmpdir(), `sm-in-${id}.webm`);
      const tmpOut = join(tmpdir(), `sm-out-${id}.ogg`);

      try {
        writeFileSync(tmpIn, audioBuffer);
        execFileSync(ffmpegPath, [
          "-y", "-i", tmpIn,
          "-c:a", "libopus", "-b:a", "128k", "-ar", "16000", "-ac", "1",
          tmpOut,
        ], { stdio: "pipe" });
        finalBuffer = readFileSync(tmpOut);
        finalMimeType = "audio/ogg";
        finalFilename = "audio.ogg";
      } finally {
        try { unlinkSync(tmpIn); } catch { /* ignore */ }
        try { unlinkSync(tmpOut); } catch { /* ignore */ }
      }
    } else {
      finalBuffer = audioBuffer;
      finalMimeType = contentType.includes("ogg") ? "audio/ogg" : contentType;
      finalFilename = contentType.includes("ogg") ? "audio.ogg" : "audio.bin";
    }

    // 3. Submit to Speechmatics via file upload
    const config = {
      type: "transcription",
      transcription_config: {
        language: options?.languageCode || "cs",
        diarization: "speaker",
        speaker_diarization_config: {
          speaker_sensitivity: 0.7,
        },
      },
      notification_config: [
        {
          url: `${process.env.WEBAUTHN_ORIGIN}/api/webhook/speechmatics`,
          contents: ["transcript.json-v2"],
        },
      ],
    };

    const formData = new FormData();
    formData.append("config", JSON.stringify(config));
    formData.append(
      "data_file",
      new Blob([new Uint8Array(finalBuffer)], { type: finalMimeType }),
      finalFilename
    );

    const res = await fetch(`${API_BASE}/jobs`, {
      method: "POST",
      headers: getHeaders(),
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Speechmatics submit failed (${res.status}): ${errText}`);
    }

    const { id } = await res.json();
    return { id };
  },

  async getResult(id: string) {
    const res = await fetch(`${API_BASE}/jobs/${id}/transcript?format=json-v2`, {
      headers: getHeaders(),
    });

    if (!res.ok) {
      return {
        id,
        status: "error" as const,
        utterances: [],
        error: `Failed to fetch transcript (${res.status})`,
      };
    }

    const data = await res.json();
    return {
      id,
      status: "completed" as const,
      utterances: groupUtterances(data.results || []),
    };
  },

  async verifyWebhook(_request: Request): Promise<boolean> {
    return true;
  },

  async parseWebhook(request: Request) {
    const url = new URL(request.url);
    const jobId = url.searchParams.get("id");
    const status = url.searchParams.get("status");

    if (!jobId) {
      return {
        id: "unknown",
        status: "error" as const,
        utterances: [],
        error: "No job ID in webhook",
      };
    }

    if (status !== "success") {
      return {
        id: jobId,
        status: "error" as const,
        utterances: [],
        error: `Transcription ${status}`,
      };
    }

    const data = await request.json();
    return {
      id: jobId,
      status: "completed" as const,
      utterances: groupUtterances(data.results || []),
    };
  },
};

/** Group word-level results into speaker utterances */
function groupUtterances(
  results: Array<{ type: string; alternatives?: Array<{ content: string; speaker?: string }> }>
): Array<{ speaker: string; text: string }> {
  const utterances: Array<{ speaker: string; text: string }> = [];
  let currentSpeaker = "";
  let currentText = "";

  for (const item of results) {
    if (item.type !== "word" && item.type !== "punctuation") continue;

    const speaker = item.alternatives?.[0]?.speaker || "UU";
    const content = item.alternatives?.[0]?.content || "";

    if (speaker !== currentSpeaker && item.type === "word") {
      if (currentText.trim()) {
        utterances.push({ speaker: currentSpeaker, text: currentText.trim() });
      }
      currentSpeaker = speaker;
      currentText = content;
    } else {
      if (item.type === "punctuation") {
        currentText += content;
      } else {
        currentText += " " + content;
      }
    }
  }

  if (currentText.trim()) {
    utterances.push({ speaker: currentSpeaker, text: currentText.trim() });
  }

  return utterances;
}
