"use client";

import { useState } from "react";
import { useLang } from "@/hooks/use-lang";

interface Utterance {
  speaker: string;
  text: string;
}

interface TranscriptViewerProps {
  utterances: Utterance[];
  speakers: Record<string, string>;
  suggestions?: string[];
  onSaveSpeakers: (speakers: Record<string, string>) => void;
}

export function TranscriptViewer({
  utterances,
  speakers: initialSpeakers,
  suggestions = [],
  onSaveSpeakers,
}: TranscriptViewerProps) {
  const { t } = useLang();
  const [speakers, setSpeakers] = useState<Record<string, string>>(initialSpeakers);
  const [editing, setEditing] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const speakerIds = [...new Set(utterances.map((u) => u.speaker))];

  function openPicker(speakerId: string) {
    setEditing(speakerId);
    setCustomMode(false);
    setEditValue(speakers[speakerId] || `${t("speaker")} ${speakerId}`);
  }

  function closePicker() {
    setEditing(null);
    setCustomMode(false);
  }

  async function applyName(speakerId: string, name: string) {
    setSaving(true);
    const updated = { ...speakers, [speakerId]: name };
    setSpeakers(updated);
    closePicker();
    await onSaveSpeakers(updated);
    setSaving(false);
  }

  async function swapSpeakers() {
    if (speakerIds.length !== 2) return;
    const [a, b] = speakerIds;
    setSaving(true);
    const updated = {
      ...speakers,
      [a]: getSpeakerName(b),
      [b]: getSpeakerName(a),
    };
    setSpeakers(updated);
    await onSaveSpeakers(updated);
    setSaving(false);
  }

  function getSpeakerName(id: string): string {
    return speakers[id] || `${t("speaker")} ${id}`;
  }

  const speakerColors: Record<string, string> = {};
  const colors = [
    "text-blue-600 dark:text-blue-400",
    "text-emerald-600 dark:text-emerald-400",
    "text-purple-600 dark:text-purple-400",
    "text-orange-600 dark:text-orange-400",
    "text-pink-600 dark:text-pink-400",
  ];
  speakerIds.forEach((id, i) => {
    speakerColors[id] = colors[i % colors.length];
  });

  function suggestionsFor(speakerId: string): string[] {
    const current = getSpeakerName(speakerId);
    const fallback = `${t("speaker")} ${speakerId}`;
    const seen = new Set<string>([current]);
    const out: string[] = [];
    for (const s of [...suggestions, fallback]) {
      const trimmed = s.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      out.push(trimmed);
    }
    return out;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start gap-3">
        {speakerIds.map((id) => (
          <div key={id} className="flex flex-col gap-2">
            <button
              onClick={() => (editing === id ? closePicker() : openPicker(id))}
              className={`rounded-full bg-muted px-3 py-1 text-sm font-medium hover:bg-border ${speakerColors[id]}`}
            >
              {getSpeakerName(id)}
            </button>

            {editing === id && (
              <div className="rounded-lg border border-border bg-background p-2 shadow-sm">
                {!customMode ? (
                  <div className="flex flex-col gap-1">
                    {suggestionsFor(id).map((name) => (
                      <button
                        key={name}
                        onClick={() => applyName(id, name)}
                        disabled={saving}
                        className="rounded-md px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                      >
                        {name}
                      </button>
                    ))}
                    <button
                      onClick={() => setCustomMode(true)}
                      className="rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
                    >
                      {t("customName")}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && applyName(id, editValue)}
                      className="w-40 rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                      autoFocus
                    />
                    <button
                      onClick={() => applyName(id, editValue)}
                      disabled={saving}
                      className="rounded bg-primary px-2 py-1 text-xs text-white"
                    >
                      {t("save")}
                    </button>
                    <button
                      onClick={closePicker}
                      className="rounded bg-muted px-2 py-1 text-xs"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {speakerIds.length === 2 && (
          <button
            onClick={swapSpeakers}
            disabled={saving}
            className="rounded-full border border-border bg-background px-3 py-1 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            ⇄ {t("swapSpeakers")}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {utterances.map((utterance, i) => (
          <div key={i} className="flex gap-3">
            <button
              onClick={() => openPicker(utterance.speaker)}
              className={`shrink-0 text-sm font-semibold ${speakerColors[utterance.speaker]}`}
            >
              {getSpeakerName(utterance.speaker)}:
            </button>
            <p className="text-sm leading-relaxed">{utterance.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
