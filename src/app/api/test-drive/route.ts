import { NextResponse } from "next/server";

export async function GET() {
  const results: Record<string, string> = {};

  // Step 1: Check env vars
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    return NextResponse.json({ error: "GOOGLE_SERVICE_ACCOUNT_KEY is not set" });
  }
  results.keyLength = `${raw.length} chars`;
  results.keyStart = raw.substring(0, 20) + "...";

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    return NextResponse.json({ error: "GOOGLE_DRIVE_FOLDER_ID is not set", ...results });
  }
  results.folderId = folderId;

  // Step 2: Parse key
  let key;
  try {
    key = JSON.parse(raw);
    results.keyParse = "raw JSON OK";
  } catch {
    try {
      key = JSON.parse(Buffer.from(raw, "base64").toString());
      results.keyParse = "base64 decode OK";
    } catch (e) {
      return NextResponse.json({
        error: `Failed to parse key: ${e instanceof Error ? e.message : String(e)}`,
        ...results,
      });
    }
  }

  results.projectId = key.project_id || "missing";
  results.clientEmail = key.client_email || "missing";

  // Step 3: Auth
  try {
    const { google } = await import("googleapis");
    const auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    const token = await auth.getAccessToken();
    results.auth = token ? `token obtained (${String(token).substring(0, 10)}...)` : "no token";
  } catch (e) {
    return NextResponse.json({
      error: `Auth failed: ${e instanceof Error ? e.message : String(e)}`,
      ...results,
    });
  }

  // Step 4: List files in folder
  try {
    const { google } = await import("googleapis");
    const auth = new google.auth.GoogleAuth({
      credentials: key,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "files(id, name)",
      pageSize: 5,
    });
    results.driveAccess = `OK — ${res.data.files?.length || 0} files found`;
    results.files = (res.data.files || []).map((f) => f.name).join(", ") || "none";
  } catch (e) {
    return NextResponse.json({
      error: `Drive access failed: ${e instanceof Error ? e.message : String(e)}`,
      ...results,
    });
  }

  return NextResponse.json({ success: true, ...results });
}
