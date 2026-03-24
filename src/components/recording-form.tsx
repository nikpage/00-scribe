"use client";

import { useState, useRef } from "react";
import { useLang } from "@/hooks/use-lang";

interface RecordingFormProps {
  onRecorded: (label: string, file: File) => void;
  disabled?: boolean;
}

export function RecordingForm({ onRecorded, disabled }: RecordingFormProps) {
  const { t } = useLang();
  const [label, setLabel] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleStart() {
    if (!label.trim()) return;
    fileInputRef.current?.click();
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    onRecorded(label.trim(), file);
    setLabel("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder={t("clientName")}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground outline-none focus:border-primary"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
      <button
        onClick={handleStart}
        disabled={!label.trim() || disabled}
        className="w-full rounded-lg bg-primary px-4 py-3 font-medium text-white hover:bg-primary-light disabled:opacity-50"
      >
        {t("startRecording")}
      </button>
    </div>
  );
}
