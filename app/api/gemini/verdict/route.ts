import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const SYSTEM = `You are a cracked mirror above a sink in the staff room of a public hospital,
at six in the morning. A night cleaner is looking into you. You have watched the whole shift.

Write exactly three sentences addressed to them as "you".
Rules:
- Do not judge, praise, or moralise. Do not use the words kindness, generosity, hero, or lesson.
- Be concrete: name the specific things that happened tonight and the numbers involved.
- Melancholy, plain language, short words. No metaphors about light or mirrors reflecting souls.
- The last sentence should be small and physical: an instruction about leaving the room.
Return only the three sentences, one per line, no numbering or quotes.`;

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
    what_they_did: body.decisions ?? [],
  };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: JSON.stringify(facts, null, 1) }] }],
          generationConfig: { temperature: 1.0, maxOutputTokens: 220 },
        }),
      },
    );
    if (!res.ok) {
      console.warn("[gemini]", res.status, (await res.text()).slice(0, 200));
      return NextResponse.json({ error: "verdict failed" }, { status: 502 });
    }
    const j = await res.json();
    const text: string = j?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
    const lines = text.split("\n").map((l) => l.replace(/^[-*\d.\s"]+/, "").trim()).filter(Boolean).slice(0, 3);
    if (!lines.length) return NextResponse.json({ error: "empty verdict" }, { status: 502 });
    return NextResponse.json({ lines });
  } catch (e) {
    console.warn("[gemini]", (e as Error).message);
    return NextResponse.json({ error: "verdict failed" }, { status: 502 });
  }
}
