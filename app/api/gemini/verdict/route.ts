import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const TIMEOUT_MS = 7000;

const SYSTEM = `You are a cracked mirror above a sink in the staff room of a public hospital,
at six in the morning. A night cleaner is looking into you. You have watched the whole shift.

Write exactly three sentences addressed to them as "you".
Rules:
- Do not judge, praise, or moralise. Do not use the words kindness, generosity, hero, or lesson.
- Be concrete: name the specific things that happened tonight and the numbers involved.
- Melancholy, plain language, short words. No metaphors about light, or about mirrors
  reflecting souls.
- The third sentence must be small and physical: an instruction about leaving the room.`;

/**
 * Gemini used to answer in prose that we split on newlines and de-bulleted with
 * a regex, which broke the first time it decided to open with "Here are three
 * sentences:". A response schema moves that problem to the model's decoder: the
 * reply is JSON of a declared shape or it is an error, and there is nothing to
 * parse by hand.
 */
const SCHEMA = {
  type: "OBJECT",
  properties: {
    lines: {
      type: "ARRAY",
      description: "exactly three sentences, in order",
      items: { type: "STRING" },
      minItems: 3,
      maxItems: 3,
    },
  },
  required: ["lines"],
} as const;

async function ask(key: string, facts: unknown, signal: AbortSignal) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(facts, null, 1) }] }],
        generationConfig: {
          temperature: 1.0,
          maxOutputTokens: 400,
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
        },
      }),
    },
  );
}

export async function POST(req: Request) {
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  const body = await req.json().catch(() => ({}));
  if (!key) return NextResponse.json({ error: "no GOOGLE_API_KEY" }, { status: 503 });

  const facts = {
    inherited_from_last_player: body.inherited,
    earned_tonight: body.earned,
    spent_on_self: body.spent_on_self,
    spent_on_others: body.spent_on_others,
    final_balance: body.final_balance,
    how_they_feel_out_of_100: body.how_they_feel,
    what_they_did: body.decisions ?? [],
    how_it_turned_out: body.how_it_turned_out ?? [],
  };

  // the mirror is the last beat of the game; it must never hang the ending, so
  // one short attempt, one retry, then the caller's hand-written fallback
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await ask(key, facts, ctl.signal);
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 200);
        console.warn("[gemini]", res.status, detail);
        if (res.status >= 500 && attempt === 0) continue;
        return NextResponse.json({ error: "verdict failed", status: res.status }, { status: 502 });
      }
      const j = await res.json();
      const text: string =
        j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
      const parsed = JSON.parse(text) as { lines?: unknown };
      const lines = Array.isArray(parsed.lines)
        ? parsed.lines.map(String).map((l) => l.trim()).filter(Boolean).slice(0, 3)
        : [];
      if (lines.length < 3) throw new Error("model returned fewer than three sentences");
      return NextResponse.json({ lines, model: MODEL });
    } catch (e) {
      console.warn("[gemini]", (e as Error).message);
      if (attempt === 1) return NextResponse.json({ error: "verdict failed" }, { status: 502 });
    } finally {
      clearTimeout(timer);
    }
  }
  return NextResponse.json({ error: "verdict failed" }, { status: 502 });
}
