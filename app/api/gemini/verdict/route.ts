import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aliases, deliberately. Pinned versions get retired for new keys -- a fresh AI
 * Studio key could call neither gemini-2.0-flash nor gemini-2.5-flash, and the
 * API only said so at request time.
 *
 * Two of them because the free tier answers 503 "this model is currently
 * experiencing high demand" at random -- measured at roughly one failure in
 * three. Retrying the same model against a capacity wall is optimistic, so the
 * attempts rotate.
 */
const MODELS = [process.env.GEMINI_MODEL || "gemini-flash-latest", "gemini-flash-lite-latest"];
const TIMEOUT_MS = 5000;
const ATTEMPTS = 3;
const BACKOFF_MS = [0, 500, 1200];

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

async function ask(key: string, model: string, facts: unknown, signal: AbortSignal) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
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
  // short attempts across two models, then the caller's hand-written fallback
  let lastStatus = 0;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (BACKOFF_MS[attempt]) await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
    const model = MODELS[attempt % MODELS.length];
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await ask(key, model, facts, ctl.signal);
      if (!res.ok) {
        lastStatus = res.status;
        console.warn("[gemini]", model, res.status, (await res.text()).slice(0, 160));
        continue;
      }
      const j = await res.json();
      // Flash is a thinking model: `parts` can carry reasoning alongside the
      // answer, and concatenating all of them corrupts the JSON. Take only the
      // parts that are actually the reply.
      const parts: { text?: string; thought?: boolean }[] = j?.candidates?.[0]?.content?.parts ?? [];
      const text = parts
        .filter((p) => !p.thought && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("");
      const parsed = JSON.parse(text) as { lines?: unknown };
      const lines = Array.isArray(parsed.lines)
        ? parsed.lines.map(String).map((l) => l.trim()).filter(Boolean).slice(0, 3)
        : [];
      if (lines.length < 3) throw new Error("fewer than three sentences");
      return NextResponse.json({ lines, model, attempts: attempt + 1 });
    } catch (e) {
      console.warn("[gemini]", model, (e as Error).message);
    } finally {
      clearTimeout(timer);
    }
  }
  return NextResponse.json({ error: "verdict failed", status: lastStatus }, { status: 502 });
}
