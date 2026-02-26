"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { generateFilename } from "@/lib/filename";
import { saveChunk, getAllChunks, clearChunks } from "@/lib/audio-store";
import { useLang } from "@/hooks/use-lang";
import { LangToggle } from "@/components/lang-toggle";

type RecordingState = "idle" | "recording" | "saving";

export default function RecordPage() {
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [state, setState] = useState<RecordingState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const { lang, switchLang, t } = useLang();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabase = createClient();
  const router = useRouter();

  // Auth gate — redirect to login if not authenticated
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/auth/login");
      } else {
        setAuthed(true);
      }
    });
  }, [supabase, router]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  async function startRecording() {
    if (!label.trim()) return;
    setError("");

    try {
      // Request microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Clear any old chunks
      await clearChunks();

      // Start MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;

      // Save chunks to IndexedDB every 5 seconds
      mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          await saveChunk(e.data);
        }
      };

      mediaRecorder.start(5000); // chunk every 5 seconds
      setState("recording");

      // Start timer
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);

      // Wake Lock — keep screen on
      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Wake Lock not available or denied — continue without it
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError(t("micDenied"));
      } else {
        setError(t("recordFailed"));
      }
    }
  }

  async function stopRecording() {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;

    setState("saving");

    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Release wake lock
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;

    // Stop recording — wait for final chunk
    await new Promise<void>((resolve) => {
      mediaRecorder.onstop = () => resolve();
      mediaRecorder.stop();
    });

    // Stop microphone
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // Assemble all chunks into one blob
    const chunks = await getAllChunks();
    if (chunks.length === 0) {
      router.push("/queue");
      return;
    }

    const blob = new Blob(chunks, { type: chunks[0].type || "audio/webm" });
    const file = new File([blob], "recording.webm", { type: blob.type });

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // Don't clear IndexedDB — chunks survive for recovery after re-login
        router.push("/auth/login");
        return;
      }

      const filename = generateFilename(label);
      const durationSeconds = elapsed;

      const { data: rec, error: dbError } = await supabase
        .from("recordings")
        .insert({
          user_id: user.id,
          label: label.trim(),
          filename,
          recorded_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
          file_size_bytes: file.size,
          status: "pending",
        })
        .select()
        .single();

      if (dbError) {
        console.error("Recording save failed:", dbError.message);
        router.push("/queue");
        return;
      }

      // Store file in memory for upload from queue
      if (typeof window !== "undefined") {
        if (!(window as unknown as Record<string, unknown>).__pendingAudioFiles) {
          (window as unknown as Record<string, Map<string, File>>).__pendingAudioFiles = new Map();
        }
        (window as unknown as Record<string, Map<string, File>>).__pendingAudioFiles.set(rec.id, file);
      }

      // Clean up IndexedDB
      await clearChunks();

      router.push("/queue");
    } catch (err) {
      console.error("Recording save failed:", err);
      router.push("/queue");
    }
  }

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 pt-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <div className="flex justify-end"><LangToggle lang={lang} onSwitch={switchLang} /></div>
        <h1 className="text-2xl font-bold text-center">{t("newRecording")}</h1>

        {state === "idle" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                {t("clientNameLabel")}
              </label>
              <input
                type="text"
                placeholder={t("clientNamePlaceholder")}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
              />
            </div>

            <button
              onClick={startRecording}
              disabled={!label.trim()}
              className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
            >
              {t("startRecording")}
            </button>
          </div>
        )}

        {state === "recording" && (
          <div className="space-y-6 text-center">
            <div className="flex items-center justify-center gap-3">
              <span className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
              <span className="text-sm font-medium text-destructive">{t("recordingInProgress")}</span>
            </div>

            <div className="text-4xl font-mono font-bold tabular-nums">
              {formatTime(elapsed)}
            </div>

            <p className="text-sm text-muted-foreground">{label}</p>

            <button
              onClick={stopRecording}
              className="w-full rounded-lg bg-destructive px-4 py-3 font-medium text-white hover:opacity-90"
            >
              {t("stopRecording")}
            </button>
          </div>
        )}

        {state === "saving" && (
          <div className="text-center space-y-4">
            <div className="animate-pulse text-muted-foreground">
              {t("savingRecording")}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        {state === "idle" && (
          <div className="text-center">
            <a href="/queue" className="text-sm text-primary hover:underline">
              {t("backToQueue")}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
