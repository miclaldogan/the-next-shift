import type { ActionTaken, GameState, SceneId, TaskKind } from "./types";

/* ===========================================================================
 * THE CAST
 * ---------------------------------------------------------------------------
 * There are five human sprite sets and five portraits, so there are five
 * people, plus a cat. One sprite is one person -- if the same PNG turns up
 * under two names the player sees it immediately, and the whole night stops
 * being believable. `tools/check/validate.ts` enforces this.
 *
 * Depth comes from time instead of headcount: each person has one first
 * encounter and two to four FOLLOW-UPS, gated on the branch the player took
 * and on how long ago they took it. It is the same person coming back
 * changed, which is the only kind of variety these portraits can honestly
 * support.
 *
 * ADDING A STORY
 *   cast   whose story this is. Must keep that cast's existing `name`.
 *   scene / pose   where they wait; the pose must exist for the cast
 *          (CAST_POSES) and have a slot in that scene (game/world.ts).
 *   fromMinute     earliest game-minute they can appear (120 = 02:00).
 *   needsFlag / blockedByFlag / delayAfterFlag
 *          how a follow-up hangs off an earlier choice. The state records
 *          *when* each flag went up, so "an hour after you paid for him" is
 *          expressible directly.
 *   mood   how the encounter itself lands, before any choice is made.
 * ======================================================================== */

export type CastId = "oldman" | "intern" | "father" | "stranger" | "nurse" | "cat";
export type Pose = "sit" | "kneel" | "stand" | "low";

export const CAST_POSES: Record<CastId, Partial<Record<Pose, string>>> = {
  oldman: { sit: "oldman.sit", stand: "oldman.walk" },
  intern: { sit: "intern.sit", kneel: "intern.kneel", stand: "intern.stand_cry" },
  father: { sit: "father.sit", kneel: "father.despair" },
  stranger: { stand: "stranger.lean", sit: "stranger.squat" },
  nurse: { stand: "nurse.idle" },
  cat: { low: "cat.idle" },
};

/** The one name each cast answers to, all night. */
export const CAST_NAMES: Record<CastId, string> = {
  oldman: "the old man",
  intern: "the intern",
  father: "the man outside theatre 2",
  nurse: "the head nurse",
  stranger: "the man on the landing",
  cat: "the cat under the stairs",           // narrated, never addressed
};

export const CAST_PORTRAITS: Partial<Record<CastId, string>> = {
  oldman: "oldman", intern: "intern", father: "father",
  stranger: "stranger", nurse: "nurse",
};

export interface Choice {
  text: string;
  coinCost?: number;
  timeCost?: number;
  hungerCost?: number;
  coinGain?: number;
  mood?: number;
  action: ActionTaken;
  /** short phrase handed to the mirror at the end of the night */
  note: string;
  /** one line for the 06:00 ledger; falls back to `note` */
  outcome?: string;
  reply: string[];
  sets?: string[];
  toast?: string;
}

export interface Story {
  id: string;
  cast: CastId;
  scene: SceneId;
  pose: Pose;
  fromMinute?: number;
  needsFlag?: string;
  blockedByFlag?: string;
  delayAfterFlag?: number;
  mood?: number;
  lines: string[];
  prompt?: string;
  choices: Choice[];
  resolved: string[];
}

export const STORIES: Story[] = [
  /* ===================================================== the old man ===== */
  {
    id: "oldman_prescription",
    cast: "oldman", scene: "corridor", pose: "sit",
    lines: [
      "Don't mind me, son. I'm just reading it again.",
      "They filled the prescription an hour ago. Twelve coins. I have four.",
      "It's fine. The pharmacy opens at nine. I'll sit until nine.",
    ],
    prompt: "He hasn't asked you for anything.",
    resolved: ["Go on. Your floor won't mop itself."],
    choices: [
      {
        text: "Put eight coins in his hand. Don't explain.",
        coinCost: 8, timeCost: 6, mood: 8, action: "helped",
        note: "paid for the old man's prescription (8)",
        outcome: "You paid the eight coins he was short.",
        sets: ["oldman_helped"], toast: "-8 coins",
        reply: ["You didn't even ask what it was for.",
                "...I'll remember this at nine o'clock. That's more than most people get."],
      },
      {
        text: "Tell the desk there's a man loitering.",
        coinGain: 3, timeCost: 4, mood: -14, action: "exploited",
        note: "reported the old man to the desk for a 3-coin tip",
        outcome: "You had him walked out for three coins.",
        sets: ["oldman_reported"], toast: "+3 coins",
        reply: ["Right. Rules.", "You've got a torch in your hand and you're pointing it at me."],
      },
      {
        text: "Nod. Keep mopping.",
        mood: -5, action: "ignored", note: "walked past the old man",
        outcome: "You left him reading the same piece of paper.",
        sets: ["oldman_ignored"],
        reply: ["That's alright. You've got a floor to finish."],
      },
    ],
  },
  {
    id: "oldman_thanks",
    cast: "oldman", scene: "corridor", pose: "sit",
    needsFlag: "oldman_helped", delayAfterFlag: 75, mood: 14,
    lines: [
      "They opened the hatch early. The girl behind it knew my name.",
      "So I've got it. Here, look — I'm not showing off, I want you to see the box.",
      "I'll be alright now for a month. A month is a long way from here.",
    ],
    prompt: "He is holding the box with both hands.",
    resolved: ["He has fallen asleep sitting up with the box in his lap."],
    choices: [
      {
        text: "\"Good.\" Go back to the floor.",
        mood: 4, action: "helped", note: "was thanked by the old man he paid for",
        outcome: "He got the prescription, and came back to show you the box.",
        reply: ["\"Good,\" he repeats, like he's testing the word."],
      },
      {
        text: "Sit down for two minutes.",
        timeCost: 10, mood: 9, action: "helped",
        note: "sat with the old man after he came back to show the prescription",
        outcome: "He came back to show you the box, and you sat down with him.",
        sets: ["oldman_sat"], toast: "-10 min",
        reply: ["He talks about his wife, who died in this building in 2011.",
                "\"Different corridor. Same floors, though. Somebody mopped them.\""],
      },
    ],
  },
  {
    id: "oldman_bitter",
    cast: "oldman", scene: "outside", pose: "sit",
    needsFlag: "oldman_reported", delayAfterFlag: 55, mood: -12,
    lines: [
      "The one in the hat walked me to the doors. He was polite about it.",
      "I'm not angry with you. You've got a list and I was on it.",
      "I'd just rather you'd said it yourself, that's all.",
    ],
    prompt: "The rain has got into the paper bag.",
    resolved: ["He has stopped looking at the doors."],
    choices: [
      {
        text: "Give him the eight coins now.",
        coinCost: 8, timeCost: 6, mood: 7, action: "helped",
        note: "paid the old man's prescription after having him removed",
        outcome: "You had him removed, then paid for it afterwards.",
        sets: ["oldman_helped"], toast: "-8 coins",
        reply: ["He takes it. He doesn't say thank you and you don't expect him to.",
                "\"That's the two things done, then. The bad one and the other one.\""],
      },
      {
        text: "\"I've got a list. You were on it.\"",
        mood: -8, action: "ignored", note: "told the old man he was just on a list",
        outcome: "You told him he was only ever on a list.",
        reply: ["\"Yes,\" he says. \"I know. That's what I said.\""],
      },
    ],
  },
  {
    id: "oldman_busstop",
    cast: "oldman", scene: "outside", pose: "sit",
    needsFlag: "oldman_ignored", delayAfterFlag: 40, mood: -6,
    lines: [
      "You again. Don't look like that.",
      "The shelter closes at two. The bus comes at nine. It's four hours of rain, that's all.",
    ],
    prompt: "He has the paper bag under his coat, keeping it dry.",
    resolved: ["He has pulled his coat over the paper bag to keep it dry."],
    choices: [
      {
        text: "Eight coins. Say it's from the hospital.",
        coinCost: 8, timeCost: 8, mood: 10, action: "helped",
        note: "found the old man at the bus stop in the rain and paid anyway (8)",
        outcome: "You found him in the rain at four, and paid anyway.",
        sets: ["oldman_helped", "oldman_late"], toast: "-8 coins",
        reply: ["The hospital doesn't give things away.",
                "But I'll let you have it. Go on, you're getting soaked."],
      },
      {
        text: "Sit under the shelter until your break ends.",
        timeCost: 30, mood: 8, action: "helped",
        note: "waited at the bus stop with the old man in the rain",
        outcome: "You waited at the bus stop with him.",
        sets: ["oldman_sat"], toast: "-30 min",
        reply: ["You'll catch something out here.", "...It's better with two. I won't pretend it isn't."],
      },
      {
        text: "Go back inside. It's warm inside.",
        mood: -10, action: "ignored", note: "left the old man at the bus stop and went back inside",
        outcome: "You left him at the bus stop and went back in.",
        sets: ["oldman_ignored_twice"],
        reply: ["Goodnight, son. Truly."],
      },
    ],
  },

  /* ======================================================= the intern ==== */
  {
    id: "intern_charts",
    cast: "intern", scene: "corridor", pose: "kneel",
    fromMinute: 138,
    lines: [
      "I'm sorry. I'll pick these up. I'm sorry, I'm in your way.",
      "Room 4. He was stable at midnight. He was stable.",
      "If she sees me like this she sends me home, and I need the hours.",
    ],
    prompt: "The charts are all over your clean floor.",
    resolved: ["...Thank you. Really."],
    choices: [
      {
        text: "Kneel down and gather the papers with her.",
        timeCost: 22, mood: 4, action: "helped",
        note: "knelt and helped the intern gather her charts",
        outcome: "You picked up her charts and said nothing comforting.",
        sets: ["intern_helped"], toast: "-22 min",
        reply: ["You didn't say it was going to be okay.",
                "Thank you for that. Everyone says that."],
      },
      {
        text: "Stand in the corridor so nobody sees her.",
        timeCost: 10, mood: 6, action: "helped",
        note: "blocked the corridor so nobody would see the intern crying",
        outcome: "You stood in the corridor so nobody would see her.",
        sets: ["intern_helped", "intern_shielded"], toast: "-10 min",
        reply: ["...Nobody came.", "Okay. Okay. I can go back in."],
      },
      {
        text: "Mop around her.",
        mood: -6, action: "ignored", note: "mopped around the crying intern",
        outcome: "You mopped around her and moved on.",
        sets: ["intern_ignored"],
        reply: ["Sorry. I'm in the way. I know."],
      },
    ],
  },
  {
    id: "intern_thanks",
    cast: "intern", scene: "corridor", pose: "stand",
    needsFlag: "intern_helped", delayAfterFlag: 80, mood: 14,
    lines: [
      "I got you one from the doctors' machine. It's better than yours. Don't tell anyone.",
      "I went back in. I did the four o'clock round and my hands were fine.",
      "I keep thinking about how you just knelt down. You didn't ask first.",
    ],
    prompt: "She is holding out a coffee in a paper cup.",
    resolved: ["The cup is on the windowsill where you left it. It's cold."],
    choices: [
      {
        text: "Take the coffee.",
        mood: 10, action: "helped", note: "was brought a coffee by the intern he helped",
        outcome: "She came back at four with a coffee from the doctors' machine.",
        sets: ["intern_thanked"],
        reply: ["It is much better than yours.", "\"Right. Room 9 next. See you.\""],
      },
      {
        text: "\"Give it to whoever's on after you.\"",
        mood: 6, action: "helped", note: "passed the intern's thank-you coffee on to the next shift",
        outcome: "She brought you a coffee; you passed it down the line.",
        sets: ["intern_thanked"],
        reply: ["\"...That's an annoying thing to say.\"",
                "She leaves it on the windowsill anyway, where the next one will find it."],
      },
    ],
  },
  {
    id: "intern_asleep",
    cast: "intern", scene: "corridor", pose: "sit",
    needsFlag: "intern_thanked", delayAfterFlag: 55,
    lines: [
      "She is asleep sitting up, with a chart still open on her knees.",
      "Her shift ended at midnight. Nobody has told her.",
    ],
    prompt: "The floor under the bench is the last dirty patch on this corridor.",
    resolved: ["She has not moved. Someone put a coat over her."],
    choices: [
      {
        text: "Mop around the bench and leave her.",
        timeCost: 10, mood: 5, action: "helped",
        note: "let the exhausted intern sleep instead of waking her",
        outcome: "At five she fell asleep on the bench, and you let her.",
        sets: ["intern_left_asleep"], toast: "-10 min",
        reply: ["She doesn't wake up.", "The floor under the bench stays dirty. It'll keep."],
      },
      {
        text: "Wake her. The desk will fine her if they find her.",
        timeCost: 6, mood: 3, action: "helped",
        note: "woke the sleeping intern before the desk could fine her",
        outcome: "You woke her before the desk found her asleep.",
        reply: ["\"What— what time—\"", "\"...Thank you. God. Thank you.\""],
      },
    ],
  },
  {
    id: "intern_quit",
    cast: "intern", scene: "fire_exit", pose: "stand",
    needsFlag: "intern_ignored", delayAfterFlag: 90, mood: -12,
    lines: [
      "She is on the landing with her coat over her scrubs and her badge already off.",
      "\"Don't. I've told the registrar, it's done, I'm not doing the last two hours.\"",
      "\"You walked past me. That's not — I'm not blaming you. Everyone did.\"",
    ],
    prompt: "The badge is in her hand and she keeps turning it over.",
    resolved: ["The landing is empty. The badge is on the step."],
    choices: [
      {
        text: "\"Do the last two hours. Then decide.\"",
        timeCost: 12, mood: 6, action: "helped",
        note: "talked the intern into finishing her shift after ignoring her earlier",
        outcome: "She nearly walked out at half four. You talked her into the last two hours.",
        sets: ["intern_stayed"], toast: "-12 min",
        reply: ["\"That's a stupid thing to say.\"", "She says it going back through the door."],
      },
      {
        text: "\"Then go. Nobody out here will stop you.\"",
        mood: -6, action: "ignored", note: "let the intern walk out mid-shift",
        outcome: "She walked out at half four, and you held the door.",
        sets: ["intern_left"],
        reply: ["\"...Right.\"", "She goes down the fire stairs rather than through the lobby."],
      },
    ],
  },

  /* ========================================== the man outside theatre 2 === */
  {
    id: "father_theatre",
    cast: "father", scene: "corridor", pose: "sit",
    fromMinute: 160,
    lines: [
      "They told me four hours. That was at eleven.",
      "I've counted the tiles across this corridor nine times. Sixty-three.",
      "You work nights. Then you know — nothing good gets decided at this hour.",
    ],
    prompt: "He is looking at the theatre door, not at you.",
    resolved: ["Still sixty-three. I checked."],
    choices: [
      {
        text: "Feed the machine five coins. Hand him the cup.",
        coinCost: 5, timeCost: 8, mood: 6, action: "helped",
        note: "bought the waiting father a hot drink (5)",
        outcome: "You bought him something hot to hold.",
        sets: ["father_helped"], toast: "-5 coins",
        reply: ["It's terrible.", "...I needed something to hold. Thank you."],
      },
      {
        text: "Sit down beside him. Say nothing.",
        timeCost: 28, mood: 9, action: "helped",
        note: "sat with the father in silence for half an hour",
        outcome: "You sat with him for half an hour and said nothing.",
        sets: ["father_helped", "father_sat"], toast: "-28 min",
        reply: ["...", "You're the first person tonight who didn't tell me to be calm."],
      },
      {
        text: "\"The surgeon in there is the best in the building.\"",
        timeCost: 4, mood: 2, action: "helped",
        note: "told the father a kind lie about the surgeon",
        outcome: "You told him the surgeon was the best in the building.",
        sets: ["father_lied"],
        reply: ["Is she?", "...Don't answer. Let me keep that one."],
      },
      {
        text: "Keep the mop moving.",
        mood: -6, action: "ignored", note: "left the father counting tiles alone",
        outcome: "You left him counting tiles.",
        sets: ["father_ignored"],
        reply: ["Of course. Sorry."],
      },
    ],
  },
  {
    id: "father_good_news",
    cast: "father", scene: "corridor", pose: "sit",
    needsFlag: "father_sat", delayAfterFlag: 85, mood: 16,
    lines: [
      "They came out at twenty past. She's in recovery. She's in recovery.",
      "The one with the glasses said it went the way they wanted, and I made her say it twice.",
      "I've been sitting here forty minutes trying to work out who to tell. You were here.",
    ],
    prompt: "He is standing up and sitting down again.",
    resolved: ["He is asleep in the chair with his coat over him like a blanket."],
    choices: [
      {
        text: "\"Then go and sit where she can see you when she wakes up.\"",
        mood: 10, action: "helped", note: "sent the father in to recovery after the good news",
        outcome: "The surgery went well. You were the one he came to tell.",
        sets: ["father_good"],
        reply: ["\"—yes. Yes.\"", "He leaves his coat on the chair. You put it on the back for him."],
      },
      {
        text: "Shake his hand.",
        mood: 12, action: "helped", note: "shook the father's hand when the news came back good",
        outcome: "The surgery went well, and he shook your hand about it.",
        sets: ["father_good"],
        reply: ["He does it with both hands, which people only do at funerals and this.",
                "\"Sixty-three,\" he says. \"I'm never counting them again.\""],
      },
    ],
  },
  {
    id: "father_bad_news",
    cast: "father", scene: "corridor", pose: "kneel",
    needsFlag: "father_helped", blockedByFlag: "father_sat", delayAfterFlag: 90, mood: -14,
    lines: [
      "He is not in the chair. He is on the floor beside it with his back against the wall.",
      "\"They came out at three. It was the bleeding, they said. They said it very quickly.\"",
      "\"You bought me a coffee. I remember that. I've been remembering that for an hour.\"",
    ],
    prompt: "The cup is still on the floor beside him, full.",
    resolved: ["The corridor is empty. The chair is where it was."],
    choices: [
      {
        text: "Sit down on the floor next to him.",
        timeCost: 26, mood: 4, action: "helped",
        note: "sat on the floor with the father after his wife died",
        outcome: "She died at three. You sat on the floor with him.",
        sets: ["father_lost", "father_sat_after"], toast: "-26 min",
        reply: ["Neither of you says anything for a long time.",
                "\"You've got a floor to do,\" he says eventually. \"It'll keep,\" you say."],
      },
      {
        text: "Get him a chair and somebody from the ward.",
        timeCost: 12, mood: 2, action: "helped",
        note: "fetched someone from the ward for the father after his wife died",
        outcome: "She died at three. You fetched someone who knew what to say.",
        sets: ["father_lost"],
        reply: ["The ward sister comes out and sits where you were going to.",
                "She is better at it than you. That is also true, and it still stings."],
      },
      {
        text: "There is nothing you can say. Leave him.",
        mood: -10, action: "ignored", note: "left the father alone after his wife died",
        outcome: "She died at three, and you left him on the floor.",
        sets: ["father_lost"],
        reply: ["You are almost certainly right that there is nothing to say.",
                "That has never once made it the same as staying."],
      },
    ],
  },
  {
    id: "father_lie_returns",
    cast: "father", scene: "corridor", pose: "sit",
    needsFlag: "father_lied", delayAfterFlag: 88, mood: -10,
    lines: [
      "\"The best in the building, you said.\"",
      "\"I'm not — look, I know you were being kind. I know that's what it was.\"",
      "\"But I held onto it for two hours. That's what I did with it. I held onto it.\"",
    ],
    prompt: "He wants something true this time.",
    resolved: ["He is looking at the theatre door again."],
    choices: [
      {
        text: "\"I don't know anything about the surgeon. I'm the cleaner.\"",
        mood: 5, action: "helped", note: "admitted the kind lie about the surgeon",
        outcome: "You told him a kind lie at two, and admitted it at four.",
        sets: ["father_truth"],
        reply: ["\"...Right.\" He almost laughs. \"Right.\"",
                "\"That's better, actually. That's a better thing to be told.\""],
      },
      {
        text: "\"She is. I've seen her here for years.\"",
        mood: -8, action: "ignored", note: "doubled down on the lie about the surgeon",
        outcome: "You doubled down on the lie when he came back to check.",
        reply: ["He nods and holds onto it again.", "It is exactly as heavy the second time."],
      },
    ],
  },
  {
    id: "father_alone",
    cast: "father", scene: "corridor", pose: "kneel",
    needsFlag: "father_ignored", delayAfterFlag: 95, mood: -12,
    lines: [
      "He is on the floor beside the chair with his back against the wall.",
      "He is not crying and he is not talking. He has the look of a man who has been told.",
      "There is nobody else in this corridor. There has been nobody else in this corridor all night.",
    ],
    prompt: "You have been past this spot eleven times.",
    resolved: ["The corridor is empty. Somebody folded the chair."],
    choices: [
      {
        text: "Sit down on the floor next to him. Late is not nothing.",
        timeCost: 24, mood: 5, action: "helped",
        note: "sat with the father after ignoring him for three hours",
        outcome: "You walked past him all night, then sat down at five.",
        sets: ["father_lost", "father_late"], toast: "-24 min",
        reply: ["He doesn't look up, and he doesn't ask you to go.",
                "It is not the same as having been there at two. It is not nothing either."],
      },
      {
        text: "Finish the corridor.",
        mood: -12, action: "ignored", note: "finished the corridor around the grieving father",
        outcome: "You finished the corridor around him.",
        sets: ["father_lost"],
        reply: ["The floor comes up beautifully.", "You can see the lights in it."],
      },
    ],
  },

  /* ==================================================== the head nurse === */
  {
    id: "nurse_cover",
    cast: "nurse", scene: "corridor", pose: "stand",
    fromMinute: 196,
    lines: [
      "Cleaning. You didn't see me leave the floor at half three.",
      "My daughter's fourteen and she's alone in the flat and the line is engaged.",
      "Twenty minutes. The board will show me signed in the whole time.",
    ],
    prompt: "She is already holding her coat.",
    resolved: ["Twenty minutes. That's all it was."],
    choices: [
      {
        text: "\"I didn't see anything.\"",
        timeCost: 4, mood: 5, action: "helped",
        note: "covered for the head nurse leaving the floor to phone her daughter",
        outcome: "You covered for her while she phoned her daughter.",
        sets: ["nurse_covered"],
        reply: ["...Right.", "There's a trolley of clean towels in the store. Take two. Don't ask."],
      },
      {
        text: "\"Sign yourself out like everyone else.\"",
        mood: -4, action: "ignored", note: "refused to cover for the head nurse",
        outcome: "You made her sign out like everyone else.",
        sets: ["nurse_refused"],
        reply: ["Everyone else has somebody at home.", "Fine. Fine."],
      },
      {
        text: "\"It'll cost you.\"",
        coinGain: 10, timeCost: 4, mood: -13, action: "exploited",
        note: "charged the head nurse 10 coins for an alibi",
        outcome: "You charged her ten coins for an alibi.",
        sets: ["nurse_blackmailed"], toast: "+10 coins",
        reply: ["Ten. There.", "I'll remember you asked."],
      },
    ],
  },
  {
    id: "nurse_repay",
    cast: "nurse", scene: "corridor", pose: "stand",
    needsFlag: "nurse_covered", delayAfterFlag: 85, mood: 10,
    lines: [
      "She'd taken the phone off the hook. Fourteen years old and she took the phone off the hook.",
      "There's two clean towels and a flask in your locker. Don't make a thing of it.",
      "And the log says I was on the floor all night, because I was. Weren't I.",
    ],
    prompt: "She is already walking off while she says it.",
    resolved: ["The flask is in your locker. It is still warm."],
    choices: [
      {
        text: "\"You were on the floor all night.\"",
        mood: 8, action: "helped", note: "kept covering for the head nurse",
        outcome: "She got through to her daughter. There's a flask in your locker.",
        sets: ["nurse_square"],
        reply: ["\"Good.\"", "That is the entire conversation and both of you are satisfied with it."],
      },
      {
        text: "\"Is she alright?\"",
        timeCost: 6, mood: 11, action: "helped",
        note: "asked the head nurse about her daughter",
        outcome: "You asked about her daughter, which nobody else had.",
        sets: ["nurse_square"],
        reply: ["She stops walking.", "\"...Yeah. Yeah, she's alright. Nobody's asked me that tonight.\""],
      },
    ],
  },
  {
    id: "nurse_grudge",
    cast: "nurse", scene: "corridor", pose: "stand",
    needsFlag: "nurse_blackmailed", delayAfterFlag: 80, mood: -12,
    lines: [
      "Cleaning. There's a note gone in about the third-floor corridor being missed.",
      "It isn't from me. I'd have said it to your face, which is more than you did.",
      "Ten coins. I keep doing the sum and it keeps coming out at ten coins.",
    ],
    prompt: "She is holding the clipboard between you like a door.",
    resolved: ["She signs things near you now, and not at you."],
    choices: [
      {
        text: "Give the ten back.",
        coinCost: 10, mood: 9, action: "helped",
        note: "gave back the 10 coins extorted from the head nurse",
        outcome: "You took ten coins off her, then gave them back before six.",
        sets: ["nurse_repaid"], toast: "-10 coins",
        reply: ["She looks at it for a while before she takes it.",
                "\"That doesn't undo it.\" \"No.\" \"...No. But take the third floor off the note.\""],
      },
      {
        text: "\"You paid it. Nobody made you.\"",
        mood: -9, action: "exploited", note: "told the head nurse she had chosen to pay the bribe",
        outcome: "You told her she'd chosen to pay.",
        reply: ["\"That's true,\" she says, and writes something down.",
                "You will not find out what until Tuesday."],
      },
    ],
  },
  {
    id: "nurse_landing",
    cast: "nurse", scene: "fire_exit", pose: "stand",
    needsFlag: "nurse_refused", delayAfterFlag: 90, mood: -4,
    lines: [
      "She is on the landing in the rain without a coat, not smoking, just standing.",
      "\"Don't. Don't ask if I'm alright, I'll go straight back in if you ask me that.\"",
      "\"Fourteen years and it still gets me when they're younger than me.\"",
    ],
    prompt: "You would not cover twenty minutes for her at half three.",
    resolved: ["The door is shut. She is back inside."],
    choices: [
      {
        text: "Stand there with her and say nothing at all.",
        timeCost: 16, mood: 8, action: "helped",
        note: "stood in the rain with the head nurse after a death on her ward",
        outcome: "You wouldn't cover for her, but you stood in the rain with her at four.",
        sets: ["nurse_landing_helped"], toast: "-16 min",
        reply: ["Four minutes. Neither of you says anything.",
                "\"Right,\" she says, and goes back in."],
      },
      {
        text: "\"Twenty minutes. Go and phone her.\"",
        timeCost: 6, mood: 10, action: "helped",
        note: "belatedly offered the head nurse the cover he had refused",
        outcome: "At four you gave her the twenty minutes you'd refused at half three.",
        sets: ["nurse_covered", "nurse_landing_helped"],
        reply: ["\"...Now?\"", "\"Now.\" She is through the door before you finish saying it."],
      },
      {
        text: "Go back inside and give her the landing.",
        mood: 1, action: "ignored", note: "left the head nurse alone on the landing",
        outcome: "You left her the landing to herself.",
        reply: ["It is possibly the correct thing to do.", "You are not sure. You do it anyway."],
      },
    ],
  },
  {
    id: "nurse_cupboard",
    cast: "nurse", scene: "corridor", pose: "stand",
    needsFlag: "stranger_dealt", delayAfterFlag: 65, mood: -16,
    lines: [
      "Third floor cupboard's been in. Door's off its hinge, half the shelf gone.",
      "Somebody went through it between half three and four. You were down that end, weren't you.",
      "...No. No, the log says you were in corridor B. Forget I asked.",
    ],
    prompt: "The log says corridor B because you mopped corridor B.",
    resolved: ["She has not asked you again."],
    choices: [
      {
        text: "\"I was in corridor B.\"",
        mood: -12, action: "exploited", note: "lied to the head nurse about where he was during the theft",
        outcome: "The cupboard was emptied while you mopped the far end, and you said nothing.",
        sets: ["stranger_covered"],
        reply: ["\"Right. Thought so.\"", "She writes it down and walks off and that is that."],
      },
      {
        text: "\"There was a man on the fire landing at half three.\"",
        timeCost: 14, mood: 6, action: "helped",
        note: "told the head nurse about the man on the landing after taking his money",
        outcome: "You took his money, then told her about him anyway.",
        sets: ["stranger_confessed"], toast: "-14 min",
        reply: ["\"And you're telling me now.\"", "\"...Yes.\" \"Right. Stay where you are.\""],
      },
    ],
  },

  /* =============================================== the man on the landing */
  {
    id: "stranger_bribe",
    cast: "stranger", scene: "fire_exit", pose: "stand",
    fromMinute: 186,
    lines: [
      "You're the night cleaner. You've got the master key for the third-floor corridor.",
      "I'm not asking you to take anything. I'm asking you to mop the far end for ten minutes.",
      "Thirty coins. Nobody gets hurt. Somebody gets to sleep tonight.",
    ],
    prompt: "He has the money out already.",
    resolved: ["He's gone. The landing smells like wet cigarettes."],
    choices: [
      {
        text: "Take the thirty. Mop the far end.",
        coinGain: 30, timeCost: 12, mood: -18, action: "exploited",
        note: "took 30 coins to look away from the drug cupboard",
        outcome: "You took thirty coins to be somewhere else for ten minutes.",
        sets: ["stranger_dealt"], toast: "+30 coins",
        reply: ["Smart. Ten minutes.", "You won't see me again. That's the part you're paying for."],
      },
      {
        text: "\"No.\" Nothing after it.",
        mood: 4, action: "helped", note: "turned down a 30-coin bribe",
        outcome: "You turned down thirty coins.",
        sets: ["stranger_refused"],
        reply: ["No is expensive. Look at your shoes.", "...Fine. Enjoy the floor."],
      },
      {
        text: "Radio the desk. Give them the landing.",
        coinGain: 6, timeCost: 10, mood: 1, action: "helped",
        note: "reported the man on the landing to the desk (+6)",
        outcome: "You radioed the desk and had him removed.",
        sets: ["stranger_reported"], toast: "+6 coins",
        reply: ["You radioed. I heard the click.",
                "Somebody upstairs is going to have a bad night now. Hope it's the right one."],
      },
    ],
  },
  {
    id: "stranger_phone",
    cast: "stranger", scene: "fire_exit", pose: "sit",
    needsFlag: "stranger_refused", delayAfterFlag: 60,
    lines: [
      "He is still out here. The hood is down. He is on the phone and he sounds about nineteen.",
      "\"—no, ma, I'm outside it. I'm standing outside it right now.\"",
      "\"...They said we'd know by six. Yeah. Yeah. Go to bed.\"",
    ],
    prompt: "The thirty coins are not mentioned by either of you.",
    resolved: ["He is asleep against the railing with the phone still in his hand."],
    choices: [
      {
        text: "Prop the fire door so the warm air reaches him.",
        timeCost: 8, mood: 6, action: "helped",
        note: "propped the fire door open for the man he had refused",
        outcome: "You said no to him at three, and propped the door open for him at four.",
        sets: ["phone_helped"], toast: "-8 min",
        reply: ["He doesn't say anything.",
                "Twenty minutes later the door is still open. He hasn't moved."],
      },
      {
        text: "\"Who's in there?\"",
        timeCost: 6, mood: 4, action: "helped",
        note: "asked the man on the landing who he was waiting on",
        outcome: "You asked who he was waiting on. He told you.",
        sets: ["phone_asked"],
        reply: ["\"My brother.\" A pause. \"He's the reason I asked you.\"",
                "\"I know,\" you say, and neither of you says the rest of it."],
      },
      {
        text: "The landing is not on your list. Go back in.",
        mood: -5, action: "ignored", note: "left the man waiting on the fire landing",
        outcome: "You left him on the landing in the rain.",
        reply: ["The door closes on the phone call."],
      },
    ],
  },
  {
    id: "stranger_removed",
    cast: "stranger", scene: "outside", pose: "stand",
    needsFlag: "stranger_reported", delayAfterFlag: 70, mood: -6,
    lines: [
      "He is on the pavement outside the doors with a security jacket either side of him.",
      "He sees you and does not make a scene about it, which is somehow worse.",
      "\"Six coins, was it. That's the bit I'd like to know. What they gave you.\"",
    ],
    prompt: "The security men are waiting for you to move along.",
    resolved: ["The pavement is empty. The rain has taken care of it."],
    choices: [
      {
        text: "\"Six.\"",
        mood: -4, action: "helped", note: "told the reported man exactly what the tip had been",
        outcome: "You reported him, and told him to his face what it paid.",
        sets: ["stranger_answered"],
        reply: ["\"Six.\" He nods slowly, like it settles something.",
                "\"Alright. Alright, that's not nothing. I'd have wanted more.\""],
      },
      {
        text: "Say nothing and keep walking.",
        mood: -7, action: "ignored", note: "walked past the man he had reported",
        outcome: "You walked past him on the way out.",
        reply: ["He watches you the whole way to the doors."],
      },
    ],
  },

  /* ========================================================== the cat ==== */
  {
    id: "cat_stairs",
    cast: "cat", scene: "fire_exit", pose: "low",
    lines: [
      "There's a sound behind the drainpipe. Wet, and very small.",
      "It doesn't run. It's too cold to run.",
    ],
    prompt: "You have half a sandwich and a towel on your shoulder.",
    resolved: ["It has moved closer to the warm brick by the door."],
    choices: [
      {
        text: "Break off half the sandwich in your pocket.",
        hungerCost: 22, timeCost: 6, mood: 7, action: "helped",
        note: "gave half of their own supper to a stray cat",
        outcome: "You gave half your supper to a cat.",
        sets: ["cat_fed"], toast: "half your supper",
        reply: ["It eats without looking away from you.", "Then it sits down. Closer this time."],
      },
      {
        text: "Dry it with the towel off your shoulder.",
        timeCost: 14, mood: 6, action: "helped",
        note: "dried a soaked stray cat with their work towel",
        outcome: "You dried it with your work towel.",
        sets: ["cat_fed", "cat_dried"], toast: "-14 min",
        reply: ["It goes rigid. Then it doesn't.",
                "The towel is ruined. You have another one. Somewhere."],
      },
      {
        text: "Pull the door shut. The rain isn't your problem.",
        mood: -6, action: "ignored", note: "shut the fire door on the stray cat",
        outcome: "You shut the door on it.",
        reply: ["The latch is louder than you expected."],
      },
    ],
  },
  {
    id: "cat_returns",
    cast: "cat", scene: "fire_exit", pose: "low",
    needsFlag: "cat_fed", delayAfterFlag: 100, mood: 12,
    lines: [
      "It is sitting on the warm brick by the door, out of the rain, waiting.",
      "It has stopped being wet. Under all of it there is a very small animal.",
      "When you open the door it does not run. It walks in.",
    ],
    prompt: "The kitchen store is warm and nobody goes in there until seven.",
    resolved: ["There is nothing under the stairs any more."],
    choices: [
      {
        text: "Hold the door.",
        mood: 12, action: "helped", note: "let the stray cat into the warm store room",
        outcome: "It came back at five, and you let it in.",
        sets: ["cat_indoors"],
        reply: ["It settles behind the boiler like it has been planning this since two.",
                "Somebody will find it at seven. That is a problem for somebody at seven."],
      },
      {
        text: "Put it back out and wedge the towel in the doorway.",
        timeCost: 8, mood: 8, action: "helped",
        note: "made a dry corner in the fire doorway for the stray cat",
        outcome: "You made it a dry corner in the doorway.",
        sets: ["cat_sheltered"],
        reply: ["It sits on the towel and looks at you the whole time you back away."],
      },
    ],
  },
];

/* ========================================================================= */
/* Radio tasks: the desk tells you what the night needs.                      */
/* ========================================================================= */

export interface TaskDef {
  id: string;
  at: number;
  kind: TaskKind;
  radio: string;
  brief: string;
  scene?: SceneId;
  count?: number;
  reward: number;
}

export const TASKS: TaskDef[] = [
  {
    id: "swamp", at: 126, kind: "mop", scene: "corridor", count: 2, reward: 6,
    radio: "Night cleaning, this is the desk. Corridor B is a swamp. Two puddles, at least.",
    brief: "Corridor B — mop 2 spills",
  },
  {
    id: "sign", at: 168, kind: "sign", scene: "corridor", reward: 5,
    radio: "Cleaning — get a wet floor sign out before somebody's grandmother goes over.",
    brief: "Put the wet floor sign by a spill",
  },
  {
    id: "landing", at: 205, kind: "visit", scene: "fire_exit", reward: 4,
    radio: "Cleaning, somebody's been on the fire landing again. Go and have a look.",
    brief: "Check the fire landing",
  },
  {
    id: "street", at: 248, kind: "visit", scene: "outside", reward: 4,
    radio: "Desk. Ambulance bay's got half a kebab on it. Outside, please. Sorry.",
    brief: "Check the ambulance bay",
  },
  {
    id: "swamp2", at: 288, kind: "mop", scene: "fire_exit", count: 2, reward: 7,
    radio: "Cleaning, the landing's flooding where the gutter's gone. Do what you can.",
    brief: "Fire landing — mop 2 spills",
  },
  {
    id: "cart", at: 326, kind: "cart", reward: 8,
    radio: "Cleaning, last hour. Trolley back to the lockers when you're done, please.",
    brief: "Take the trolley back to the lockers",
  },
];

export const RADIO_FLAVOUR: { at: number; text: string }[] = [
  { at: 152, text: "Desk to cleaning. Theatre 2 is running long. Keep the corridor quiet." },
  { at: 275, text: "Desk. Four o'clock. You're doing fine. Don't stop." },
  { at: 352, text: "Desk to cleaning. That's the shift. Go home. Thank you." },
];

/* ========================================================================= */

export interface VendingItem {
  id: string;
  label: string;
  price: number;
  hunger?: number;
  fatigue?: number;
  mood?: number;
  blurb: string;
}

export const VENDING: VendingItem[] = [
  { id: "sandwich", label: "Cheese sandwich", price: 5, hunger: 38, mood: 2, blurb: "Sealed in 1998, probably." },
  { id: "coffee", label: "Black coffee", price: 3, fatigue: -26, mood: 3, blurb: "Hot brown water. It works." },
  { id: "chocolate", label: "Chocolate bar", price: 2, hunger: 16, mood: 4, blurb: "Half a meal, twice the guilt." },
  { id: "soup", label: "Tomato soup", price: 4, hunger: 24, fatigue: -10, mood: 3, blurb: "Comes out at the temperature of a bath." },
];

/* ========================================================================= */
/* Mood. It drifts down on its own; people move it far more than coffee does. */
/* ========================================================================= */

export interface MoodMark {
  id: string;
  below?: number;
  above?: number;
  lines: string[];
}

export const MOOD_MARKS: MoodMark[] = [
  {
    id: "sinking", below: 42,
    lines: ["The corridor is exactly the same corridor it was last night, and the night before that."],
  },
  {
    id: "low", below: 24,
    lines: [
      "Your hands have gone heavy on the handle.",
      "Nothing has happened. That is somehow the worst version of it.",
    ],
  },
  {
    id: "bottom", below: 10,
    lines: [
      "You stop in the middle of the floor and cannot immediately think why you started.",
      "The mop is still going. You are watching it from somewhere slightly behind your own head.",
    ],
  },
  { id: "lifting", above: 62, lines: ["Something in your chest lets go about a centimetre."] },
  {
    id: "good", above: 82,
    lines: [
      "You catch yourself walking faster than the job requires.",
      "It is four in the morning in a public hospital and you are, briefly, fine.",
    ],
  },
];

/* ========================================================================= */
/* The last four minutes. Each end phase names one thing to do and one place  */
/* to do it, because at 06:00 the player has no reason to guess the order.    */
/* ========================================================================= */

export const END_STEPS: Record<string, { text: string; hotspotId: string }> = {
  shift_end: { text: "Get changed — locker 14", hotspotId: "locker" },
  verdict: { text: "Look in the mirror", hotspotId: "mirror" },
  handover: { text: "Leave something on the walkie-talkie", hotspotId: "radio" },
};

export const UI = {
  title: "THE NEXT SHIFT",
  subtitle: "a night at St. Mercy",
  loading: "clocking in…",
  press: "PRESS ENTER",
  hint: "WASD / arrows to move · E to interact · SPACE to mop · ↑↓ to choose",
  hud: { coins: "COINS", hunger: "FED", fatigue: "TIRED", mood: "MOOD" },
  noCoins: "not enough coins",
  ate: "the machine grinds, and gives",
  machineAte: "the machine takes your coin and gives nothing",
  whatDo: "WHAT DO YOU DO?",
  vending: "COLD DRINKS · HOT DRINKS · SNACKS",
  leave: "Leave it.",
  taskDone: "task done",
  carrying: "E to set it down",
  occupied: "somebody is sitting on it",
  ledgerTitle: "WHO WAS IN THE BUILDING TONIGHT",
  ledgerEmpty: "You did not speak to anyone tonight.",
  ledgerMore: "PRESS E",
  chainTitle: "THE SHIFTS BEFORE YOURS",
  chainBroken: "the chain does not check out",
};

export const INTRO: string[] = [
  "The lock on locker 14 has been broken since before you started.",
  "You open it with your thumb, the way the last one showed you.",
  "There is a jacket. There is a radio that only receives.",
  "And there is money on the shelf, wrapped in a cleaning cloth.",
];

/** Fallback mirror monologue when Gemini is unreachable. */
export function localVerdict(s: GameState): string[] {
  const kept = s.coins;
  const helped = s.decisions.filter((d) => d.actionTaken === "helped").length;
  const used = s.decisions.filter((d) => d.actionTaken === "exploited").length;

  if (used > 0 && s.spentOnOthers === 0)
    return [
      "You are counting it again. You have counted it four times since the stairs.",
      "It spends the same as anyone's. That was always going to be true.",
      "Turn the light off on your way out. The glass doesn't need to watch.",
    ];
  if (s.mood < 25)
    return [
      "You did the hours. Nobody is going to tell you that you didn't do the hours.",
      "It went out of you faster than it went into anyone else, and you noticed, and you kept going.",
      "Wash your hands. The water takes a minute to run warm.",
    ];
  if (helped >= 3)
    return [
      "Four hours ago you had a number on a shelf and no reason to lose any of it.",
      `You are leaving with ${kept}. The difference is standing in a corridor somewhere, still breathing.`,
      "Wash your face. You look like someone who can afford it.",
    ];
  if (helped > 0)
    return [
      "You gave once tonight, and then you stopped, and you know exactly where you stopped.",
      "That's not nothing. It is also not very much, and you can hold both of those.",
      "Go home. The floor will be filthy again by Tuesday.",
    ];
  return [
    "You kept all of it. Nobody asked you not to. Nobody will.",
    "The old man is at the bus stop and the number in your pocket has not changed.",
    "Come back tomorrow. The crack in me isn't going anywhere either.",
  ];
}
