# PROJECT PLAN: THE NEXT SHIFT

## 1. Executive Summary & Vision

"The Next Shift" is an atmospheric, 16-bit retro-aesthetic 2D pixel narrative-simulation web game developed for the DEV Weekend Challenge: Generosity Edition.

* **Core Concept:** The player assumes the role of an exhausted janitor working the night shift at a public hospital from 02:00 to 06:00. Starting with a small amount of money left by someone else, the player earns coins by completing tasks. While racing against time, hunger, and fatigue, the player faces moral dilemmas about whether to help the desperate people around them.
* **The Big Reveal:** When the game ends, the janitor opens their locker. The player discovers that the starting money was not a built-in game mechanic, but a real legacy left on the blockchain by the previous player. As the janitor removes their jacket, the player must choose what to leave for the next shift (the next player).
* **Sponsor Technologies:**
  1. **Solana Devnet:** A transparent, decentralized ledger (Memo Program) recording the balance and voice testament passed sequentially between players.
  2. **ElevenLabs:** Powers the walkie-talkie announcements, hospital ambient soundscapes (SFX), and the weary voice of the previous player whispering their legacy through the locker radio (TTS).
  3. **Google AI (Gemini):** Generates a dynamic "Moral and Conscience Report" spoken by the cracked mirror in the locker room at the end of the shift, analyzing all decisions made by the player.

---

## 2. Timeline & Mechanics (Hackathon Sprint Plan)

| Phase | Duration | Goal | Deliverable |
|---|---|---|---|
| **Phase 1: Asset Prep** | 2 Hours | Clear magenta (`#FF00FF`) backgrounds from sprite sheets, slice sprites, and organize props/portraits. | Clean PNGs inside `/public/assets/` |
| **Phase 2: Engine & Canvas** | 4 Hours | Build HTML5 Canvas 640x360 retro renderer, janitor state machine (Idle, Walk, Mop), camera, and scene transitions. | Playable 2D movement prototype |
| **Phase 3: Quests & Encounters** | 6 Hours | Implement 4 main scenes (Corridor, Fire Exit, Street, Locker Room), 5 character interactions, and UI dialogue engine. | Playable full game loop |
| **Phase 4: Service Integrations** | 4 Hours | Connect ElevenLabs audio engine, Solana Devnet Keypair/Memo read-write service, and Gemini mirror report prompt. | End-to-end Web3 + AI pipeline |
| **Phase 5: Polish & Delivery** | 4 Hours | Add sound effects, typewriter text effects, retro UI bars, and draft the DEV.to submission post. | Live Vercel link + DEV Post |

---

## 3. Scene Flow & Locations

1. **Intro / Opening:**
   * Screen fades from black. A crackling walkie-talkie announcement and the exhausted voice of the previous janitor echo (ElevenLabs).
   * The locker opens: "You found X Coins in the locker."
2. **Hospital Corridor (`hospitalInside.jpg`):**
   * Mopping tasks (timed spills).
   * Vending machine (`vending machine` prop) and resting bench (`bench` prop).
   * Encounters: Elderly Man without a Prescription (`oldman.png`), Crying Intern Doctor (`studentNurse.png`), Father outside the Operating Room (`father.png`).
3. **Fire Escape (`hospitalFireout.png`):**
   * Cold, rainy transitional corridor.
   * Encounters: Wet Stray Cat (`cat.png`) and Shady Medicine Dealer (`stranger.png`).
4. **Hospital Exterior / Rainy Street (`hospitalOutside.png`):**
   * Discharged patients with nowhere to go, isolation under a streetlamp, fresh air breathing zone.
5. **Locker Room / Final Reveal (`mcRoom.png`):**
   * 06:00 AM. Drop the mop, change into civilian clothes (`mcNormalClothes`).
   * Cracked mirror monologue (Gemini Analysis).
   * Walkie-talkie recording + Solana Devnet balance transfer for the next shift.
