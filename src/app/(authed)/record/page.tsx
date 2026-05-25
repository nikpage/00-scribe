"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { generateFilename } from "@/lib/filename";
import { saveChunk, getAllChunks, clearChunks, saveRecordingBlob } from "@/lib/audio-store";
import { useLang } from "@/hooks/use-lang";
import { useKeepAliveWhile } from "@/hooks/use-idle";

function readRecordParams(): {
  kind: "interview" | "worker_notes";
  parentRecordingId: string | null;
} {
  if (typeof window === "undefined") {
    return { kind: "worker_notes", parentRecordingId: null };
  }
  const params = new URLSearchParams(window.location.search);
  // Notes is the default flow — the in-person meeting isn't recorded.
  // ?kind=interview switches to the old multi-speaker interview path.
  const kind = params.get("kind") === "interview" ? "interview" : "worker_notes";
  return { kind, parentRecordingId: params.get("parent") };
}

type RecordingState = "idle" | "recording" | "saving";

type ClientSuggestion = { id: string; name: string; address: string | null };

export default function RecordPage() {
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [suggestions, setSuggestions] = useState<ClientSuggestion[]>([]);
  const [speakerCount, setSpeakerCount] = useState(2);
  const [error, setError] = useState("");
  const [state, setState] = useState<RecordingState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { lang, t } = useLang();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingChunkSavesRef = useRef<Promise<void>[]>([]);
  const router = useRouter();
  const [{ kind, parentRecordingId }, setRecordParams] = useState<{
    kind: "interview" | "worker_notes";
    parentRecordingId: string | null;
  }>({ kind: "worker_notes", parentRecordingId: null });
  const isNotes = kind === "worker_notes";

  useEffect(() => {
    setRecordParams(readRecordParams());
  }, []);

  // For a notes recording, the client is fixed by the parent interview —
  // we resolve the parent's label once so the UI can show "Notes for X".
  useEffect(() => {
    if (!isNotes || !parentRecordingId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/recordings");
      if (!res.ok || cancelled) return;
      const { recordings } = await res.json();
      const parent = (recordings as { id: string; label: string }[]).find(
        (r) => r.id === parentRecordingId
      );
      if (parent && !cancelled) setLabel(parent.label);
    })();
    return () => {
      cancelled = true;
    };
  }, [isNotes, parentRecordingId]);

  // Keep the idle lock at bay while a recording or upload is in flight.
  useKeepAliveWhile(state === "recording" || state === "saving" || uploadingFile);

  // Prefill name + address when arriving from a client page's "New visit".
  useEffect(() => {
    const raw = sessionStorage.getItem("scribe-prefill");
    if (!raw) return;
    sessionStorage.removeItem("scribe-prefill");
    try {
      const { label: l, address: a } = JSON.parse(raw);
      if (typeof l === "string") setLabel(l);
      if (typeof a === "string") setAddress(a);
    } catch {
      // Ignore malformed prefill payload — not worth surfacing.
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  // Debounced client-name autocomplete.
  useEffect(() => {
    const q = label.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clients/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data.clients || []);
      } catch {
        // Ignore network errors on suggestions — they're optional UX.
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [label]);

  function pickSuggestion(c: ClientSuggestion) {
    setLabel(c.name);
    setAddress(c.address || "");
    setSuggestions([]);
  }

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      await clearChunks();
      pendingChunkSavesRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          pendingChunkSavesRef.current.push(saveChunk(e.data));
        }
      };

      mediaRecorder.onerror = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        wakeLockRef.current?.release().catch(() => {});
        wakeLockRef.current = null;
        setState("idle");
        setError(t("recordFailed"));
      };

      mediaRecorder.start(5000);
      setState("recording");

      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);

      try {
        if ("wakeLock" in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request("screen");
        }
      } catch {
        // Wake Lock not available — continue
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

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;

    await new Promise<void>((resolve) => {
      mediaRecorder.onstop = () => resolve();
      mediaRecorder.stop();
    });

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    // The final ondataavailable fires just before onstop, but its saveChunk
    // is async — wait for every pending IndexedDB write before reading back,
    // otherwise short recordings lose their only chunk.
    await Promise.all(pendingChunkSavesRef.current);
    pendingChunkSavesRef.current = [];

    const chunks = await getAllChunks();
    if (chunks.length === 0) {
      router.push("/queue");
      return;
    }

    const blob = new Blob(chunks, { type: chunks[0].type || "audio/webm" });

    // Generate ID and save audio to IndexedDB FIRST — survives page close
    const recordingId = crypto.randomUUID();
    await saveRecordingBlob(recordingId, blob);
    await clearChunks();

    // Save metadata via server API (bypasses client-side auth/RLS issues)
    try {
      const filename = generateFilename(label);

      const res = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: recordingId,
          label: label.trim(),
          address: address.trim() || null,
          filename,
          recorded_at: new Date().toISOString(),
          duration_seconds: elapsed,
          file_size_bytes: blob.size,
          speakers_expected: isNotes ? 1 : speakerCount,
          language: lang,
          kind,
          parent_recording_id: parentRecordingId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("DB insert failed:", data.error);
        sessionStorage.setItem("scribe-error", data.error || t("saveFailed"));
      }
    } catch (err) {
      console.error("Save failed:", err);
      sessionStorage.setItem(
        "scribe-error",
        err instanceof Error ? err.message : t("saveFailed")
      );
    }

    router.push("/queue");
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !label.trim()) return;

    setError("");
    setUploadingFile(true);

    try {
      const recordingId = crypto.randomUUID();
      const filename = generateFilename(label);

      // 1. Create recording row
      const metaRes = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: recordingId,
          label: label.trim(),
          address: address.trim() || null,
          filename,
          recorded_at: new Date().toISOString(),
          duration_seconds: null,
          file_size_bytes: file.size,
          speakers_expected: isNotes ? 1 : speakerCount,
          kind,
          parent_recording_id: parentRecordingId,
        }),
      });

      if (!metaRes.ok) {
        const data = await metaRes.json().catch(() => ({}));
        throw new Error(data.error || t("saveFailed"));
      }

      // 2. Upload audio file
      const formData = new FormData();
      formData.append("file", file, filename);
      formData.append("recordingId", recordingId);
      formData.append("filename", filename);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        const data = await uploadRes.json().catch(() => ({}));
        throw new Error(data.error || t("uploadFailed"));
      }

      // 3. Submit for transcription
      const transcribeRes = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId }),
      });

      if (!transcribeRes.ok) {
        const data = await transcribeRes.json().catch(() => ({}));
        throw new Error(data.error || t("transcriptionFailed"));
      }

      router.push("/queue");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("uploadFailed"));
      setUploadingFile(false);
    }
  }

  return (
    <div className="p-4 pt-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-center">
          {isNotes ? t("postSessionNotesTitle") : t("newRecording")}
        </h1>

        {state === "idle" && (
          <div className="space-y-4">
            {isNotes && parentRecordingId ? (
              <div className="rounded-lg border border-border bg-muted p-3 text-sm">
                <div className="text-xs text-muted-foreground">{t("notesForClient")}</div>
                <div className="font-medium">{label || "…"}</div>
              </div>
            ) : (
              <>
                <div className="relative">
                  <label className="block text-sm font-medium mb-1">
                    {t("clientNameLabel")}
                  </label>
                  <input
                    type="text"
                    placeholder={t("clientNamePlaceholder")}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
                    autoComplete="off"
                  />
                  {suggestions.length > 0 && (
                    <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-auto rounded-lg border border-border bg-background shadow-lg">
                      {suggestions.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => pickSuggestion(c)}
                            className="block w-full px-4 py-3 text-left text-sm hover:bg-muted"
                          >
                            <div className="font-medium">{c.name}</div>
                            {c.address && (
                              <div className="text-xs text-muted-foreground">{c.address}</div>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t("addressLabel")}
                  </label>
                  <input
                    type="text"
                    placeholder={t("addressPlaceholder")}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
                    autoComplete="off"
                  />
                </div>

                {!isNotes && (
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {t("speakerCount")}
                    </label>
                    <div className="flex gap-2">
                      {[2, 3].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setSpeakerCount(n)}
                          className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium ${
                            speakerCount === n
                              ? "border-primary bg-primary text-white"
                              : "border-border bg-background text-foreground"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <button
              onClick={startRecording}
              disabled={!label.trim() || uploadingFile}
              className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
            >
              {isNotes ? t("startNotesRecording") : t("startRecording")}
            </button>

            <div className="relative flex items-center gap-3">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs text-muted-foreground">{t("orUploadFile")}</span>
              <div className="flex-1 border-t border-border" />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!label.trim() || uploadingFile}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              {uploadingFile ? t("uploadingFile") : t("selectAudioFile")}
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

      </div>
    </div>
  );
}
