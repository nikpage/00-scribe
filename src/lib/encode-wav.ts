/** Decode any browser-supported audio blob to 16-bit PCM WAV via Web Audio API */
export async function encodeWav(blob: Blob): Promise<Blob> {
  const ctx = new OfflineAudioContext(1, 1, 16000);
  const arrayBuf = await blob.arrayBuffer();
  const audioBuf = await ctx.decodeAudioData(arrayBuf);

  // Resample to 16 kHz mono
  const offline = new OfflineAudioContext(1, Math.ceil(audioBuf.duration * 16000), 16000);
  const source = offline.createBufferSource();
  source.buffer = audioBuf;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  const samples = rendered.getChannelData(0);
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);
  const dataSize = pcm.length * 2;

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);          // chunk size
  view.setUint16(20, 1, true);           // PCM
  view.setUint16(22, 1, true);           // mono
  view.setUint32(24, 16000, true);       // sample rate
  view.setUint32(28, 16000 * 2, true);   // byte rate
  view.setUint16(32, 2, true);           // block align
  view.setUint16(34, 16, true);          // bits per sample
  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  return new Blob([wavHeader, pcm.buffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
