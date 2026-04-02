import type { TranscriptionProvider } from "./types";

const API_BASE = "https://asr.api.speechmatics.com/v2";

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.SPEECHMATICS_API_KEY!}`,
  };
}

export const speechmaticsProvider: TranscriptionProvider = {
  async submit(audioUrl: string, options?: { speakersExpected?: number; languageCode?: string }) {
    // Download audio from signed URL
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      throw new Error(`Failed to download audio (${audioRes.status})`);
    }
    const audioBuffer = await audioRes.arrayBuffer();
    const contentType = audioRes.headers.get("content-type") || "audio/webm";
    console.log(`[Speechmatics] audio size=${audioBuffer.byteLength}, content-type="${contentType}", first4bytes="${new Uint8Array(audioBuffer.slice(0, 4)).join(",")}"`);

    // Submit to Speechmatics via file upload
    const config = {
      type: "transcription",
      transcription_config: {
        language: options?.languageCode || "cs",
        operating_point: "enhanced",
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
    // Strip codec params — Speechmatics infers codec from the container
    const mimeBase = contentType.split(";")[0].trim();
    const ext = mimeBase.includes("webm") ? "webm" : mimeBase.includes("ogg") ? "ogg" : "wav";
    formData.append(
      "data_file",
      new Blob([audioBuffer], { type: mimeBase }),
      `audio.${ext}`
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
