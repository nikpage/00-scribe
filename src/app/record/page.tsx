"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { generateFilename } from "@/lib/filename";

export default function RecordPage() {
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const router = useRouter();

  function handleStartRecording() {
    if (!label.trim()) return;
    setError("");
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSaving(true);
    setError("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/login");
        return;
      }

      const filename = generateFilename(label);

      const { data: rec, error: dbError } = await supabase
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

      if (dbError) {
        setError(`Chyba: ${dbError.message}`);
        setSaving(false);
        return;
      }

      // Store file in memory for upload from queue
      if (typeof window !== "undefined") {
        if (!(window as unknown as Record<string, unknown>).__pendingAudioFiles) {
          (window as unknown as Record<string, Map<string, File>>).__pendingAudioFiles = new Map();
        }
        (window as unknown as Record<string, Map<string, File>>).__pendingAudioFiles.set(rec.id, file);
      }

      router.push("/queue");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Něco se pokazilo");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen p-4 pt-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-center">Nový záznam</h1>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Jméno klienta</label>
            <input
              type="text"
              placeholder="např. Novák Jan"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
            />
          </div>

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
            disabled={!label.trim() || saving}
            className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
          >
            {saving ? "Ukládání..." : "Nahrát"}
          </button>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </div>

        <div className="text-center">
          <a href="/queue" className="text-sm text-primary hover:underline">
            ← Fronta
          </a>
        </div>
      </div>
    </div>
  );
}
