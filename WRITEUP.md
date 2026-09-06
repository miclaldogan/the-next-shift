---
title: "The money in the game is real, and the last player left it there"
published: false
tags: gamedev, solana, ai, webdev
---

*Built for the DEV Weekend Challenge: Generosity Edition.*

**The Next Shift** is a 16-bit narrative game about a hospital janitor working
02:00 to 06:00. You start the shift with coins you did not earn, you mop for a
few more, and you meet five people and a cat who need something. At 06:00 you
open locker 14, take off the overalls, and decide how much of what is left stays
on the shelf.

The starting money is not a game constant. It is the previous player's actual
decision, read back off Solana devnet, and the message you hear on the locker
radio is the 140 characters they recorded before they clocked out.

Everything below is the part that was actually hard.

---

## 1. Memos as a linked list, not a receipt

The easy version of "put it on chain" is: write a transaction, show the player
an explorer link, done. That is a receipt. It proves a thing happened; it does
not do anything.

The handover is one transaction carrying a Memo Program instruction:

```json
{ "app": "the-next-shift", "shift": 7, "leftCoins": 14,
  "msg": "Machine eats coins on the second try.",
  "prev": "4kQ2…9xM" }
```

`prev` is the signature of the shift *this* player inherited. That one field
turns a pile of independent memos into a linked list, and it buys something
concrete: the ordering stops depending on the RPC.

Without it, "what is the newest shift?" means trusting whatever order
`getSignaturesForAddress` returned. With it, every record names its parent, so
the order is recoverable from the data, and a gap or a fork is *detectable*:

```ts
let verified = true;
for (let i = 0; i < shifts.length - 1; i++) {
  if (shifts[i].prev !== shifts[i + 1].signature) { verified = false; break; }
}
```

Point one record at the wrong parent and the API says so:

```
verified: False
  #3  left  3  local-3  <- prev local-99   ← does not match
  #1  left 12  local-1  <- prev None
```

The title screen shows the last four handovers before yours, and whether the
chain checks out. It is the first thing you see, and it is the whole premise of
the game stated as data.

**And the question everyone asks first: no, Solana does not need an API key.**
Devnet's RPC is public and keyless. What you need is a *signing* key, which you
generate yourself and which nobody issues to you:

```js
const kp = Keypair.generate();          // that's the whole ceremony
```

The one place a key helps is reliability. The public devnet faucet is heavily
rate limited, and it told me so in production terms while I was testing:

```
airdrop attempt 1… refused (Internal error)
airdrop attempt 2… 429: "You've either reached your airdrop limit today
                          or the airdrop faucet has run dry."
```

So `SOLANA_RPC_URL` points at a provider endpoint, and that provider's key is
the only optional key in the whole Solana path. Worth knowing before a judge
opens your demo at the same moment as four other people.

---

## 2. A response schema is a parser you do not have to write

The mirror above the sink gets your numbers and every decision you made, and
answers in three sentences. Version one asked for three sentences and split the
reply on newlines:

```ts
const lines = text.split("\n").map(l => l.replace(/^[-*\d.\s"]+/, "")).filter(Boolean);
```

This works until the model opens with "Here are three sentences:", or returns a
markdown list, or wraps one sentence across two lines. Then the last beat of the
game renders a bullet character and half a sentence.

Declaring the shape moves that problem into the decoder:

```ts
generationConfig: {
  responseMimeType: "application/json",
  responseSchema: {
    type: "OBJECT",
    properties: {
      lines: { type: "ARRAY", items: { type: "STRING" }, minItems: 3, maxItems: 3 },
    },
    required: ["lines"],
  },
}
```

Now the reply is JSON of a declared shape or it is an error, and there is no
regex. The regex was never a parsing bug — it was a *contract* bug.

The rest is unglamorous and mattered more than the schema did.

Two things only show up against the live API. First, a key issued today can
call neither `gemini-2.0-flash` nor `gemini-2.5-flash` — both are closed to new
users, and you find out at request time, as a 404 carrying a sentence of prose.
So the model is an alias, `gemini-flash-latest`, not a pin.

Second, the free tier answers `503 "This model is currently experiencing high
demand"` at random. I measured roughly one failure in three, arriving on
requests with no pattern to them — I spent twenty minutes convinced my schema
was malformed before I noticed a *plain* request failing the same way. Retrying
the same model against a capacity wall is optimism, so the attempts rotate:

```ts
const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];
const BACKOFF_MS = [0, 500, 1200];
// attempt N uses MODELS[N % MODELS.length]
```

Three attempts, five seconds each, then a hand-written fallback monologue
chosen from the same numbers. In practice it now lands on the second attempt,
on the lite model. The mirror is the emotional payload of the ending; it is not
allowed to hang it, and it is not allowed to be blank.

One more, specific to thinking models: `candidates[0].content.parts` can carry
reasoning next to the answer, and my first version concatenated every part's
text. That produces invalid JSON from a model that is emitting perfectly valid
JSON. Filter to the parts that are not thoughts.

---

## 3. The filter decides the bitrate

The previous player's voice and the desk's radio calls are ElevenLabs speech,
but they are not *played* as speech. They go through a walkie-talkie:

```ts
const hp = ctx.createBiquadFilter();   hp.type = "highpass"; hp.frequency.value = 300;
const lp = ctx.createBiquadFilter();   lp.type = "lowpass";  lp.frequency.value = 3400;
const peak = ctx.createBiquadFilter(); peak.type = "peaking";
peak.frequency.value = 1700; peak.gain.value = 7;
// then tanh soft-clip, then carrier hiss under it
```

Once you have written that chain, a fact falls out of it: everything above
3.4 kHz is thrown away before anyone hears it. So requesting those lines at
44.1 kHz / 128 kbps is paying for bytes the band-pass deletes.

```ts
const FORMAT = {
  previous: "mp3_22050_32",   // heard through the radio
  nurse:    "mp3_22050_32",   // heard through the radio
  mirror:   "mp3_44100_128",  // heard dry, in the room
};
```

Inaudible after the filter, roughly a quarter of the transfer. The mirror plays
dry, so it keeps the good encoding. This is my favourite kind of optimisation:
the DSP you wrote for artistic reasons hands you the engineering answer.

Everything else you hear has no file behind it at all. The fluorescent hum is a
50 Hz sawtooth through a low-pass with a 100 Hz square harmonic on top; the rain
is shaped brown noise in two bands; the monitor beeping four rooms away is a
sine blip on a four-second timer. There are no audio assets in the repository.

---

## 4. Chroma keying is not thresholding

The art came as sheets composited over flat magenta. The obvious approach:

```py
mask = (r > 200) & (g < 60) & (b > 200)
alpha[mask] = 0
```

This is wrong in a way that only shows up after you look closely. The artist
painted *translucent* things straight onto the magenta — mop water, wet cloth,
every anti-aliased edge. A hard threshold either keeps those as bright pink or
eats them whole. My first build had a vivid magenta puddle under the mop,
because the water was drawn as a grey film over the backing and came out at
`(80, 1, 73)` — magenta, but nowhere near the threshold.

The fix is to stop classifying pixels and start solving the compositing
equation. A pixel is `a` of the real colour `F` over `1-a` of the key `K`.
Magenta excess — how far red and blue run ahead of green — gives `a`; then `F`
falls out by un-mixing `K` back off:

```py
KEY = np.array([238.0, 12.0, 239.0])          # the sheets' actual magenta
KEY_SPREAD = min(KEY[0], KEY[2]) - KEY[1]     # 226

excess = np.minimum(r, b) - g
alpha  = np.clip(1.0 - excess / KEY_SPREAD, 0.0, 1.0)

# only trust the estimate where the hue really is the key's
hue_ok = np.clip(1.0 - np.abs(r - b) / 110.0, 0.0, 1.0)
alpha  = 1.0 - (1.0 - alpha) * hue_ok

fg = (rgb - (1.0 - alpha) * KEY) / np.maximum(alpha, 0.02)
```

Run the numbers on that puddle pixel: `(73 - 1) / 226 = 0.32`, so alpha 0.68,
and un-mixing leaves a near-black film. The magenta smear becomes a dark wet
streak on the floor — which is what it was always meant to be. Residual pink
across the whole atlas went from **0.40 % of opaque pixels to 0.11 %**, and the
fringe-erosion pass I had written became unnecessary: fractional alpha handles
anti-aliased edges for free, because that is exactly what fractional alpha is.

One more trap. Downscaling RGBA naively lets transparent pixels bleed their
colour into the silhouette, because the resampler averages RGB it has no
business averaging. Scale in premultiplied space and divide back out:

```py
pm  = np.dstack([rgb * a, alpha])
im  = Image.fromarray(pm).resize((w, h), Image.LANCZOS)
out = arr[..., :3] / np.maximum(arr[..., 3:4] / 255, 1e-4)
```

---

## 5. The bug that made everyone walk sideways

A tester said the old man on the bench "keeps turning left and right". He was
right, and the cause was not the animation.

Frames are detected in each sheet by connected-component labelling, because the
sheets are not on a grid. Each frame is then cropped to its own content and
anchored at the horizontal centroid of its bottom slab — the feet. That sounds
reasonable and it is quietly broken: when an arm moves, the bounding box
changes, so the crop changes, so the anchor changes, so the *body* jumps
sideways between frames.

The fix is to measure the error and cancel it. Stamp every frame into a shared
canvas at its own anchor, find the whole-pixel shift that best overlays it on
the first frame, and fold that shift back into the anchor:

```py
best, score = (0, 0), -1
for dy in range(-sy, sy + 1):
    rolled = np.roll(m, dy, axis=0)
    for dx in range(-sx, sx + 1):
        v = np.logical_and(ref, np.roll(rolled, dx, axis=1)).sum()
        if v > score:
            score, best = v, (dx, dy)
anchors[i] = (ax - best[0], ay - best[1])
```

The build now prints what it corrected, and the answer was much worse than one
old man:

```
mc.walk        10px      ← the player character, all night
oldman.walk     9px
nurse.walk_far  7px
intern.kneel    6px
nurse.idle      5px
…12 animations
```

Ten pixels on a 132-pixel-tall sprite. Nobody had reported the player sliding
around because nobody looks at the thing they are steering — they looked at the
old man sitting still, where the same defect had nowhere to hide.

The general lesson is the one I keep relearning: when a pipeline derives
per-item metadata independently, it will disagree with itself, and the
disagreement surfaces as motion.

---

## 6. Making the tools tell you when you are wrong

Three checks earned their keep more than any test I wrote.

**Render the scene without a browser.** A Python script reads the scene table
straight out of the TypeScript and composites the background, the floor band,
every slot's stand-in sprite and every hotspot rectangle. That is how I found
that characters were 27 % too small — measured against door frames and bench
seats in the art, a 175 cm person wants 132 px, not the 104 px I had guessed —
and that the locker room is painted at a much closer scale than the street, so
each scene needs its own `charScale`.

**Validate the content tables.** `npm run check:content` refuses a story whose
pose has no slot in its scene, a follow-up waiting on a flag no choice ever
raises, a doorway that drops you inside another doorway's trigger, and — after
I made exactly this mistake — a pose that more than six stories share one slot
for. It also enforces one name per sprite, which is the rule I broke worst:

**Six people, not thirty.** I expanded the story pool to thirty entries and it
made the game worse, because five human portraits were being asked to play
eighteen different named characters. The nurse PNG was five people. You notice
instantly, and the whole night stops being believable. The fix was to cut back
to six identities and move the variety into *time*: each person has one first
meeting and two to four callbacks, gated on which branch you took and how long
ago. The state records when each flag was raised, so "an hour and a quarter
after you paid for his prescription" is expressible directly:

```ts
{ id: "oldman_thanks", cast: "oldman",
  needsFlag: "oldman_helped", delayAfterFlag: 75, mood: 14, … }
```

Helping the intern is worth almost nothing at the time. It is worth a lot at
four in the morning, when she comes back with a coffee from the doctors'
machine. And it does not always pay: buy the man outside theatre 2 a coffee at
two, and at three he may be the one who tells you it did not work.

---

## Try it

- **Play:** *(deployment link)*
- **Code:** *(repository link)*

Without any keys the game is fully playable — silent, on a local ledger, with
the fallback mirror. Each integration degrades rather than breaks, which is
also the only reason I could keep building at four in the morning when a faucet
was dry and a rate limiter had opinions.
