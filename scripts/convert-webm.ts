/**
 * Convert a recording's audio from WebM to OGG in Supabase Storage.
 * Usage: npx tsx scripts/convert-webm.ts <recording-id>
 */
import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import "dotenv/config";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const id = process.argv[2];
if (!id) { console.error("Usage: npx tsx scripts/convert-webm.ts <recording-id>"); process.exit(1); }

async function main() {
  const { data: rec } = await supabase.from("recordings").select("drive_audio_id").eq("id", id).single();
  if (!rec?.drive_audio_id) { console.error("No audio found"); process.exit(1); }

  console.log(`Downloading ${rec.drive_audio_id}...`);
  const { data, error } = await supabase.storage.from("recordings").download(rec.drive_audio_id);
  if (error || !data) { console.error("Download failed:", error?.message); process.exit(1); }

  writeFileSync("/tmp/convert.webm", Buffer.from(await data.arrayBuffer()));
  console.log("Converting WebM → OGG...");
  execSync("ffmpeg -y -i /tmp/convert.webm -c:a libopus -b:a 128k /tmp/convert.ogg", { stdio: "pipe" });

  const ogg = readFileSync("/tmp/convert.ogg");
  console.log(`Uploading OGG (${(ogg.length / 1024).toFixed(0)} KB)...`);

  const { error: upErr } = await supabase.storage.from("recordings").upload(rec.drive_audio_id, ogg, {
    contentType: "audio/ogg",
    upsert: true,
  });
  if (upErr) { console.error("Upload failed:", upErr.message); process.exit(1); }

  unlinkSync("/tmp/convert.webm");
  unlinkSync("/tmp/convert.ogg");
  console.log("Done.");
}

main();
