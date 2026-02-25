"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { generateFilename } from "@/lib/filename";

export default function RecordPage() {
  const [label, setLabel] = useState("");
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const router = useRouter();
  const [audioFile, setAudioFile] = useState<File | null>(null);

  function handleStartRecording() {
    if (!label.trim()) return;
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setAudioFile(file);
    setRecording(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/auth/login");
      return;
    }

    const filename = generateFilename(label);

    // Create recording row
    const { data: rec, error } = await supabase
      .from("recordings")
      .insert({
        user_id: user.id,
        label: label.trim(),
        filename,
        recorded_at: new Date().toISOString(),
        duration_seconds: null,
        file_size_bytes: file.size,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create recording:", error);
      setRecording(false);
      return;
    }

    // Store file reference for upload from queue
    if (typeof window !== "undefined") {
      const pending = JSON.parse(sessionStorage.getItem("pendingFiles") || "{}");
      // We can't store File objects in sessionStorage, so we'll use a different approach
      // Store the recording ID and let the queue page handle upload
      pending[rec.id] = true;
      sessionStorage.setItem("pendingFiles", JSON.stringify(pending));

      // Store the actual file in a global map
      if (!(window as unknown as Record<string, unknown>).__pendingAudioFiles) {
        (window as unknown as Record<string, Map<string, File>>).__pendingAudioFiles = new Map();
      }
      (window as unknown as Record<string, Map<string, File>>).__pendingAudioFiles.set(rec.id, file);
    }

    router.push("/queue");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">New Recording</h1>
          <p className="mt-2 text-muted-foreground">
            Enter a label, then record the interview
          </p>
        </div>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Client name (e.g. NovakJan)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            onClick={handleStartRecording}
            disabled={!label.trim() || recording}
            className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
          >
            {recording ? "Processing..." : "Start Recording"}
          </button>
        </div>

        <div className="text-center">
          <a href="/queue" className="text-sm text-primary hover:underline">
            Back to queue
          </a>
        </div>
      </div>
    </div>
  );
}
