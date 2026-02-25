import { google } from "googleapis";
import { Readable } from "stream";

function getAuth() {
  const key = JSON.parse(
    Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!, "base64").toString()
  );
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

function getDrive() {
  return google.drive({ version: "v3", auth: getAuth() });
}

const folderId = () => process.env.GOOGLE_DRIVE_FOLDER_ID!;

export async function getOrCreateWorkerFolder(workerName: string): Promise<string> {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${folderId()}' in parents and name = '${workerName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
  });
  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }
  const folder = await drive.files.create({
    requestBody: {
      name: workerName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [folderId()],
    },
    fields: "id",
  });
  return folder.data.id!;
}

export async function createResumableUploadUri(
  filename: string,
  mimeType: string,
  parentFolderId: string
): Promise<{ uri: string; fileId: string }> {
  const drive = getDrive();
  const res = await drive.files.create(
    {
      requestBody: {
        name: filename,
        parents: [parentFolderId],
      },
      media: {
        mimeType,
        body: Readable.from([]),
      },
      fields: "id",
    },
  );
  // For resumable uploads, we create the file metadata first, then return info
  // The client will use the Drive API directly with the file ID
  return { uri: "", fileId: res.data.id! };
}

export async function getDownloadUrl(fileId: string): Promise<string> {
  const drive = getDrive();
  const auth = getAuth();
  const token = await auth.getAccessToken();
  return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&access_token=${token}`;
}

export async function uploadFile(
  filename: string,
  content: Buffer | string,
  mimeType: string,
  parentFolderId: string
): Promise<string> {
  const drive = getDrive();
  const res = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [parentFolderId],
    },
    media: {
      mimeType,
      body: Readable.from([typeof content === "string" ? Buffer.from(content) : content]),
    },
    fields: "id",
  });
  return res.data.id!;
}

export async function saveTextFile(
  filename: string,
  text: string,
  parentFolderId: string
): Promise<string> {
  return uploadFile(filename, text, "text/plain", parentFolderId);
}

export async function updateTextFile(fileId: string, text: string): Promise<void> {
  const drive = getDrive();
  await drive.files.update({
    fileId,
    media: {
      mimeType: "text/plain",
      body: Readable.from([Buffer.from(text)]),
    },
  });
}

export async function deleteFile(fileId: string): Promise<void> {
  const drive = getDrive();
  await drive.files.delete({ fileId });
}

export async function getResumableUploadUri(
  filename: string,
  mimeType: string,
  parentFolderId: string
): Promise<string> {
  const auth = getAuth();
  const token = await auth.getAccessToken();

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: filename,
        parents: [parentFolderId],
      }),
    }
  );

  const location = res.headers.get("Location");
  if (!location) throw new Error("Failed to get resumable upload URI");
  return location;
}
