export interface TranscriptMetrics {
  totalWords: number;
  totalTurns: number;
  durationMinutes: number;
  speakerMetrics: Record<
    string,
    {
      words: number;
      turns: number;
      avgWordsPerTurn: number;
      talkRatio: number; // 0-1
    }
  >;
  longestMonologue: { speaker: string; words: number };
  avgTurnLength: number;
}

export function computeMetrics(
  utterances: { speaker: string; text: string }[],
  durationSeconds: number | null
): TranscriptMetrics {
  const speakerWords: Record<string, number> = {};
  const speakerTurns: Record<string, number> = {};
  let totalWords = 0;
  let longestMonologue = { speaker: "", words: 0 };

  for (const u of utterances) {
    const words = u.text.split(/\s+/).filter(Boolean).length;
    totalWords += words;
    speakerWords[u.speaker] = (speakerWords[u.speaker] || 0) + words;
    speakerTurns[u.speaker] = (speakerTurns[u.speaker] || 0) + 1;

    if (words > longestMonologue.words) {
      longestMonologue = { speaker: u.speaker, words };
    }
  }

  const speakerMetrics: TranscriptMetrics["speakerMetrics"] = {};
  for (const speaker of Object.keys(speakerWords)) {
    const words = speakerWords[speaker];
    const turns = speakerTurns[speaker];
    speakerMetrics[speaker] = {
      words,
      turns,
      avgWordsPerTurn: turns > 0 ? Math.round(words / turns) : 0,
      talkRatio: totalWords > 0 ? words / totalWords : 0,
    };
  }

  return {
    totalWords,
    totalTurns: utterances.length,
    durationMinutes: durationSeconds ? Math.round(durationSeconds / 60) : 0,
    speakerMetrics,
    longestMonologue,
    avgTurnLength: utterances.length > 0 ? Math.round(totalWords / utterances.length) : 0,
  };
}
