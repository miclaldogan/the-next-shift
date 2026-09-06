import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Three voices for three registers of the same night. */
const VOICES: Record<string, string> = {
  previous: process.env.ELEVENLABS_VOICE_PREVIOUS || "21m00Tcm4TlvDq8ikWAM",
  nurse: process.env.ELEVENLABS_VOICE_NURSE || "21m00Tcm4TlvDq8ikWAM",
  mirror: process.env.ELEVENLABS_VOICE_MIRROR || "21m00Tcm4TlvDq8ikWAM",
};

const SETTINGS: Record<string, object> = {
  previous: { stability: 0.42, similarity_boost: 0.75, style: 0.35, speed: 0.92 },
  nurse: { stability: 0.65, similarity_boost: 0.7, style: 0.15 },
  mirror: { stability: 0.30, similarity_boost: 0.6, style: 0.55, speed: 0.88 },
};

/** Speech is expensive and the same lines repeat, so keep the last few around. */
const cache = new Map<string, ArrayBuffer>();
const CACHE_MAX = 24;

export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  const { text, voice = "previous" } = await req.json().catch(() => ({ text: "" }));
  const line = String(text ?? "").slice(0, 600).trim();
  if (!line) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (!key) return NextResponse.json({ error: "no ELEVENLABS_API_KEY" }, { status: 503 });

  const id = `${voice}:${line}`;
  const hit = cache.get(id);
  if (hit) return new NextResponse(hit, { headers: { "content-type": "audio/mpeg" } });

  const voiceId = VOICES[voice] ?? VOICES.previous;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text: line,
        model_id: process.env.ELEVENLABS_MODEL || "eleven_turbo_v2_5",
        voice_settings: SETTINGS[voice] ?? SETTINGS.previous,
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.warn("[elevenlabs]", res.status, detail.slice(0, 200));
    return NextResponse.json({ error: "tts failed", status: res.status }, { status: 502 });
  }

  const buf = await res.arrayBuffer();
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(id, buf);
  return new NextResponse(buf, { headers: { "content-type": "audio/mpeg" } });
}
