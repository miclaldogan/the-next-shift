import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Three registers of the same night, and they must not be the same voice. */
const VOICES: Record<string, string | undefined> = {
  previous: process.env.ELEVENLABS_VOICE_PREVIOUS,
  nurse: process.env.ELEVENLABS_VOICE_NURSE,
  mirror: process.env.ELEVENLABS_VOICE_MIRROR,
};

const SETTINGS: Record<string, object> = {
  previous: { stability: 0.42, similarity_boost: 0.75, style: 0.35, speed: 0.92 },
  nurse: { stability: 0.65, similarity_boost: 0.7, style: 0.15 },
  mirror: { stability: 0.3, similarity_boost: 0.6, style: 0.55, speed: 0.88 },
};

/**
 * The previous player and the desk are heard through a walkie-talkie: the
 * client band-passes them to 300-3400 Hz and soft-clips the result, which
 * throws away everything a high bitrate was paying for. Sending those at
 * 22 kHz / 32 kbps is inaudible after the filter and roughly a quarter of the
 * bytes. The mirror plays dry, so it keeps the good encoding.
 */
const FORMAT: Record<string, string> = {
  previous: "mp3_22050_32",
  nurse: "mp3_22050_32",
  mirror: "mp3_44100_128",
};

/** Lines repeat -- the intro plays the same message every time. */
const cache = new Map<string, ArrayBuffer>();
const CACHE_MAX = 32;

function remember(id: string, buf: ArrayBuffer) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(id, buf);
}

export async function POST(req: Request) {
  const key = process.env.ELEVENLABS_API_KEY;
  const { text, voice = "previous" } = await req.json().catch(() => ({ text: "" }));
  const line = String(text ?? "").slice(0, 600).trim();
  if (!line) return NextResponse.json({ error: "empty" }, { status: 400 });
  if (!key) return NextResponse.json({ error: "no ELEVENLABS_API_KEY" }, { status: 503 });

  const register = voice in VOICES ? (voice as string) : "previous";
  const voiceId = VOICES[register] ?? VOICES.previous;
  if (!voiceId)
    return NextResponse.json({ error: `no voice id for "${register}"` }, { status: 503 });

  const id = `${register}:${voiceId}:${line}`;
  const hit = cache.get(id);
  if (hit) {
    return new NextResponse(hit, {
      headers: { "content-type": "audio/mpeg", "x-cache": "hit" },
    });
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=${FORMAT[register]}`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        text: line,
        model_id: process.env.ELEVENLABS_MODEL || "eleven_turbo_v2_5",
        voice_settings: SETTINGS[register] ?? SETTINGS.previous,
      }),
    },
  );

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    console.warn("[elevenlabs]", res.status, detail.slice(0, 200));
    return NextResponse.json({ error: "tts failed", status: res.status }, { status: 502 });
  }

  // one branch goes to the player now, the other fills the cache in the
  // background so the second time this line comes round it costs nothing
  const [toClient, toCache] = res.body.tee();
  void (async () => {
    try {
      const buf = await new Response(toCache).arrayBuffer();
      if (buf.byteLength > 512) remember(id, buf);
    } catch { /* a dropped cache fill is not worth reporting */ }
  })();

  return new NextResponse(toClient, {
    headers: { "content-type": "audio/mpeg", "x-cache": "miss" },
  });
}
