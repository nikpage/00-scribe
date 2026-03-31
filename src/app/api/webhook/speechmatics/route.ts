import { NextResponse } from "next/server";
import { speechmaticsProvider } from "@/lib/transcription/speechmatics";
import { processTranscriptionResult } from "@/lib/transcription/process-result";

export async function POST(request: Request) {
  try {
    const result = await speechmaticsProvider.parseWebhook(request);
    const outcome = await processTranscriptionResult(result, result.id);

    if (!outcome.found) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    return NextResponse.json({ status: outcome.status });
  } catch (err) {
    console.error("Speechmatics webhook error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
