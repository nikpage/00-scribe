/**
 * Test script: transcribe a recording from Supabase Storage using Speechmatics.
 *
 * Usage:
 *   npx tsx scripts/test-speechmatics.ts <recording-id>
 *
 * Requires env vars (from .env.local):
 *   SPEECHMATICS_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import "dotenv/config";

const SPEECHMATICS_API_KEY = process.env.SPEECHMATICS_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SPEECHMATICS_API_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing env vars. Need SPEECHMATICS_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const recordingId = process.argv[2];
if (!recordingId) {
  console.error("Usage: npx tsx scripts/test-speechmatics.ts <recording-id>");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // 1. Get recording from DB
  console.log(`Fetching recording ${recordingId}...`);
  const { data: recording, error } = await supabase
    .from("recordings")
    .select("drive_audio_id, speakers, label")
    .eq("id", recordingId)
    .single();

  if (error || !recording?.drive_audio_id) {
    console.error("Recording not found or no audio:", error?.message);
    process.exit(1);
  }

  console.log(`Recording: "${recording.label}", audio: ${recording.drive_audio_id}`);

  // 2. Download audio from Supabase Storage
  console.log("Downloading audio from Supabase Storage...");
  const { data: audioData, error: dlError } = await supabase.storage
    .from("recordings")
    .download(recording.drive_audio_id);

  if (dlError || !audioData) {
    console.error("Failed to download audio:", dlError?.message);
    process.exit(1);
  }

  const webmBuffer = Buffer.from(await audioData.arrayBuffer());
  console.log(`WebM size: ${(webmBuffer.length / 1024).toFixed(0)} KB`);

  // 3. Convert WebM to WAV (Speechmatics doesn't accept WebM)
  console.log("Converting to WAV...");
  const tmpWebm = join(tmpdir(), `scribe-${recordingId}.webm`);
  const tmpWav = join(tmpdir(), `scribe-${recordingId}.wav`);
  writeFileSync(tmpWebm, webmBuffer);
  execSync(`ffmpeg -y -i "${tmpWebm}" -ar 16000 -ac 1 "${tmpWav}"`, { stdio: "pipe" });
  const audioBuffer = readFileSync(tmpWav);
  unlinkSync(tmpWebm);
  unlinkSync(tmpWav);
  console.log(`WAV size: ${(audioBuffer.length / 1024).toFixed(0)} KB`);

  // 4. Submit to Speechmatics batch API
  console.log("Submitting to Speechmatics...");

  const config = {
    type: "transcription",
    transcription_config: {
      language: "cs",
      diarization: "speaker",
      speaker_diarization_config: {
        speaker_sensitivity: 0.7,
      },
    },
  };

  const formData = new FormData();
  formData.append("config", JSON.stringify(config));
  formData.append("data_file", new Blob([audioBuffer], { type: "audio/wav" }), "audio.wav");

  const submitRes = await fetch("https://asr.api.speechmatics.com/v2/jobs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SPEECHMATICS_API_KEY}`,
    },
    body: formData,
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    console.error(`Speechmatics submit failed (${submitRes.status}):`, errText);
    process.exit(1);
  }

  const { id: jobId } = await submitRes.json();
  console.log(`Job submitted: ${jobId}`);

  // 5. Poll for results
  console.log("Waiting for transcription...");
  let result;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const statusRes = await fetch(`https://asr.api.speechmatics.com/v2/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${SPEECHMATICS_API_KEY}` },
    });

    if (!statusRes.ok) {
      console.error(`Status check failed (${statusRes.status})`);
      continue;
    }

    const statusData = await statusRes.json();
    const status = statusData.job?.status;
    process.stdout.write(`  ${status}...`);

    if (status === "done") {
      // Fetch transcript
      const transcriptRes = await fetch(
        `https://asr.api.speechmatics.com/v2/jobs/${jobId}/transcript?format=json-v2`,
        { headers: { Authorization: `Bearer ${SPEECHMATICS_API_KEY}` } }
      );

      if (!transcriptRes.ok) {
        console.error(`\nFailed to fetch transcript (${transcriptRes.status})`);
        process.exit(1);
      }

      result = await transcriptRes.json();
      console.log("\n");
      break;
    }

    if (status === "rejected" || status === "deleted") {
      console.error(`\nJob ${status}`);
      process.exit(1);
    }
  }

  if (!result) {
    console.error("Timed out waiting for transcription");
    process.exit(1);
  }

  // 6. Format output as speaker utterances (group consecutive words by speaker)
  const words = result.results?.filter((r: any) => r.type === "word" || r.type === "punctuation") || [];

  const utterances: { speaker: string; text: string }[] = [];
  let currentSpeaker = "";
  let currentText = "";

  for (const word of words) {
    const speaker = word.alternatives?.[0]?.speaker || "UU";
    const content = word.alternatives?.[0]?.content || "";

    if (speaker !== currentSpeaker && word.type === "word") {
      if (currentText.trim()) {
        utterances.push({ speaker: currentSpeaker, text: currentText.trim() });
      }
      currentSpeaker = speaker;
      currentText = content;
    } else {
      if (word.type === "punctuation") {
        currentText += content;
      } else {
        currentText += " " + content;
      }
    }
  }
  if (currentText.trim()) {
    utterances.push({ speaker: currentSpeaker, text: currentText.trim() });
  }

  // Print results
  console.log("=== SPEECHMATICS TRANSCRIPT ===\n");
  for (const u of utterances) {
    console.log(`[${u.speaker}]: ${u.text}\n`);
  }
  console.log(`\nTotal utterances: ${utterances.length}`);
  console.log(`Total words: ${words.filter((w: any) => w.type === "word").length}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
