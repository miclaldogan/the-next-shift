# ARCHITECTURE & TECHNICAL SPECIFICATION

## 1. System Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT (BROWSER / CANVAS)                        │
│                                                                             │
│   ┌───────────────────┐    ┌─────────────────────┐    ┌─────────────────┐   │
│   │ Game Loop (60FPS) │───▶│ State Engine        │───▶│ Audio Engine    │   │
│   │ (RequestAnimFrame)│    │ (Time, Stats, Shift)│    │ (Web Audio API) │   │
│   └───────────────────┘    └─────────────────────┘    └─────────────────┘   │
│             │                         │                                     │
│             ▼                         ▼                                     │
│   ┌───────────────────┐    ┌─────────────────────┐                          │
│   │ Canvas Renderer   │    │ Dialogue & UI System│                          │
│   │ (640x360 Retro)   │    │ (Portraits, Choices)│                          │
│   └───────────────────┘    └─────────────────────┘                          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Fetch / REST
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      BACKEND SERVERLESS (API ROUTES)                        │
│                                                                             │
│   ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────┐  │
│   │ /api/solana/shift     │  │ /api/elevenlabs/tts   │  │ /api/gemini/   │  │
│   │ - Read latest Memo    │  │ - Stream voice note   │  │   verdict      │  │
│   │ - Submit new Shift tx │  │ - Corridor Ambience   │  │ - Moral Report │  │
│   └──────────┬────────────┘  └───────────┬───────────┘  └───────┬────────┘  │
└──────────────┼───────────────────────────┼──────────────────────┼───────────┘
               ▼                           ▼                      ▼
      ┌─────────────────┐         ┌─────────────────┐   ┌──────────────────┐
      │ Solana Devnet   │         │ ElevenLabs API  │   │ Google Gemini    │
      │ (Memo Program)  │         │ (Voice & SFX)   │   │ 1.5 Flash API    │
      └─────────────────┘         └─────────────────┘   └──────────────────┘
```

---

## 2. Core Game State Model

```typescript
interface GameState {
  time: {
    hour: number;      // 2 to 6
    minute: number;    // 0 to 59
    totalSeconds: number; // 360 seconds (6 mins real time)
  };
  stats: {
    hunger: number;    // 0 - 100 (Decays over time)
    fatigue: number;   // 0 - 100 (Increases with action)
    coins: number;     // Starting from previous shift memo
  };
  currentLocation: 'corridor' | 'fire_exit' | 'outside' | 'locker_room';
  tasks: Task[];
  interactionsDone: Record<string, boolean>;
  decisionHistory: DecisionLog[];
}

interface DecisionLog {
  npcId: string;
  actionTaken: 'helped' | 'ignored' | 'exploited';
  coinDelta: number;
  timeSpent: number;
  timestamp: string;
}
```

---

## 3. Solana Integration Pipeline (Zero-Wallet Onboarding)

* **Keypair:** A devnet operator wallet securely hosted on the backend. The user does not need to install Phantom.
* **Initialization:** When the game boots, it calls `/api/solana/shift`. It reads the `memo` field of the latest transaction to fetch the remaining balance and voice note ID left by the previous player.
* **Ending (Shift Handover):**
  * The player chooses how much of their remaining balance to leave in the locker (`donatedCoins`).
  * The player writes a 140-character walkie-talkie testament.
  * The backend executes a `SystemProgram.transfer` + `MemoProgram` call on Solana Devnet.
  * Memo Format:

```json
{
  "app": "the-next-shift",
  "shift": 42,
  "leftCoins": 14,
  "msg": "Don't go to the cafeteria, the vending machine eats your coins. Watch out for the woman in room 3."
}
```

---

## 4. Audio Architecture (ElevenLabs & Web Audio)

1. **Ambient Layer (Looping Background):**
   * Corridor: Fluorescent hum + distant heartbeat monitor beep.
   * Fire Escape: Rain sounds + metallic dripping.
2. **SFX Layer (Interaction):**
   * Mop friction sound (`mop_stroke.wav`).
   * Iron coin jingle (`coins_drop.wav`).
   * Walkie-talkie static toggle (`walkie_click.wav`).
3. **Voice Layer (Narrative / Legacy):**
   * The previous player's testament is generated via ElevenLabs TTS (`model: eleven_turbo_v2_5`, tired male or whispering female voice profile) and played at the start of the game with a walkie-talkie filter applied (Bandpass EQ: 300Hz - 3400Hz).

---

## 5. Gemini Moral Engine (Mirror Monologue)

* **Endpoint:** `/api/gemini/verdict`
* **Prompt Logic:**

```text
System: You are a cracked mirror in a night-shift hospital.
Input: The player's sacrifices and selfish decisions throughout the night:
{
  "earned": 28,
  "spent_on_self": 6,
  "spent_on_others": 18,
  "cat_fed": true,
  "stranger_reported": false,
  "intern_helped": true,
  "final_balance": 4
}
Task: Generate a 3-sentence, raw, melancholic, and impactful monologue spoken from the perspective of the mirror looking back at the janitor's face. Do not judge; simply whisper the truth and the value of what was lost.
```
