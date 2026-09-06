/**
 * Static sanity pass over the content tables. A story whose pose has no slot in
 * its scene can never appear, and nothing at runtime would tell you.
 */
import { STORIES, CAST_POSES, CAST_PORTRAITS, TASKS, VENDING, MOOD_MARKS } from "../../game/content";
import { SCENES, CARRIABLES } from "../../game/world";

const problems: string[] = [];
const ok: string[] = [];

// every flag any choice can raise -- a story gated on anything else is dead
const producible = new Set<string>();
for (const st of STORIES) for (const c of st.choices) for (const f of c.sets ?? []) producible.add(f);
producible.add("machine_ate");

const ids = new Set<string>();
for (const st of STORIES) {
  if (ids.has(st.id)) problems.push(`duplicate story id: ${st.id}`);
  ids.add(st.id);

  const scene = SCENES[st.scene];
  if (!scene) { problems.push(`${st.id}: unknown scene ${st.scene}`); continue; }
  if (!scene.slots.some((s) => s.pose === st.pose))
    problems.push(`${st.id}: scene "${st.scene}" has no "${st.pose}" slot -- this story can never appear`);
  if (!CAST_POSES[st.cast]?.[st.pose])
    problems.push(`${st.id}: cast "${st.cast}" has no "${st.pose}" animation`);
  if (!st.choices.length) problems.push(`${st.id}: no choices`);
  for (const c of st.choices)
    if (!c.reply.length) problems.push(`${st.id}: a choice has no reply`);
  if (st.cast !== "cat" && !CAST_PORTRAITS[st.cast])
    problems.push(`${st.id}: cast "${st.cast}" has no portrait`);

  if (st.needsFlag && !producible.has(st.needsFlag))
    problems.push(`${st.id}: waits on flag "${st.needsFlag}" that no choice ever sets`);
  if (st.blockedByFlag && !producible.has(st.blockedByFlag))
    problems.push(`${st.id}: blocked by flag "${st.blockedByFlag}" that no choice ever sets`);
  if (st.delayAfterFlag !== undefined && !st.needsFlag)
    problems.push(`${st.id}: delayAfterFlag without needsFlag does nothing`);
  if (st.needsFlag && (st.delayAfterFlag ?? 0) > 200)
    problems.push(`${st.id}: waits ${st.delayAfterFlag} minutes -- the shift is only 240`);

  // a story that can only ever sit on a carryable is at the player's mercy
  const poseSlots = scene.slots.filter((sl) => sl.pose === st.pose);
  if (poseSlots.length && poseSlots.every((sl) => sl.needsProp))
    problems.push(`${st.id}: its only "${st.pose}" slot needs the ${poseSlots[0].needsProp}, which the player can carry off`);
}

// follow-ups should exist for the branches worth following up
const followUps = STORIES.filter((s) => s.needsFlag);
if (followUps.length < 4) problems.push("almost nothing calls back -- write more follow-ups");
if (!MOOD_MARKS.some((m) => m.below !== undefined)) problems.push("no mood marks fire on the way down");
if (!MOOD_MARKS.some((m) => m.above !== undefined)) problems.push("no mood marks fire on the way up");

// every scene should be reachable from every other, one way or another
const reach = new Map<string, string[]>();
for (const [id, sc] of Object.entries(SCENES)) reach.set(id, sc.exits.map((e) => e.to));
const seen = new Set<string>(["locker_room"]);
const queue = ["locker_room"];
while (queue.length) {
  const cur = queue.shift()!;
  for (const next of reach.get(cur) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
}
for (const id of Object.keys(SCENES))
  if (!seen.has(id)) problems.push(`scene "${id}" is unreachable from the locker room`);

// landings must not sit inside the destination's own exit triggers
for (const [id, sc] of Object.entries(SCENES))
  for (const e of sc.exits) {
    const dest = SCENES[e.to];
    for (const de of dest.exits) {
      const inside =
        e.landing.x > de.x && e.landing.x < de.x + de.w &&
        e.landing.y > de.y && e.landing.y < de.y + de.h;
      if (inside)
        problems.push(`${id} -> ${e.to}: you land inside the "${de.label}" trigger and get the wrong prompt`);
    }
    const f = dest.floor;
    if (e.landing.x < f.left || e.landing.x > f.right || e.landing.y < f.top || e.landing.y > f.bottom)
      problems.push(`${id} -> ${e.to}: landing is outside the destination floor band`);
  }

for (const t of TASKS) {
  if (t.scene && !SCENES[t.scene]) problems.push(`task ${t.id}: unknown scene`);
  if (t.kind === "mop" && t.scene && !SCENES[t.scene].spillArea)
    problems.push(`task ${t.id}: asks for mopping in a scene with no spill area`);
  if (t.kind === "sign" && t.scene && !SCENES[t.scene].spillArea)
    problems.push(`task ${t.id}: asks for a sign in a scene with no spills`);
}
if (!TASKS.some((t) => t.kind === "cart")) problems.push("no task ever uses the trolley");
if (!VENDING.length) problems.push("the vending machine is empty");
for (const id of Object.keys(CARRIABLES)) {
  const c = CARRIABLES[id as keyof typeof CARRIABLES];
  const f = SCENES[c.scene].floor;
  if (c.x < f.left || c.x > f.right || c.y < f.top || c.y > f.bottom)
    problems.push(`carriable "${id}" starts outside the ${c.scene} floor band`);
}
for (const sc of Object.values(SCENES))
  for (const sl of sc.slots)
    if (sl.needsProp && !(sl.needsProp in CARRIABLES))
      problems.push(`slot "${sl.id}" needs unknown carryable "${sl.needsProp}"`);

// a pose everyone wants and one slot to put them in means half the pool never runs
for (const [id, sc] of Object.entries(SCENES)) {
  const slotsFor: Record<string, number> = {};
  for (const sl of sc.slots) slotsFor[sl.pose] = (slotsFor[sl.pose] ?? 0) + 1;
  const wantFor: Record<string, number> = {};
  for (const st of STORIES) if (st.scene === id) wantFor[st.pose] = (wantFor[st.pose] ?? 0) + 1;
  for (const [pose, want] of Object.entries(wantFor)) {
    const have = slotsFor[pose] ?? 0;
    if (have && want / have > 6)
      problems.push(`${id}: ${want} "${pose}" stories share ${have} slot(s) -- most will never appear`);
  }
}

const perScene: Record<string, number> = {};
for (const st of STORIES) perScene[st.scene] = (perScene[st.scene] ?? 0) + 1;
ok.push(`${STORIES.length} stories: ${Object.entries(perScene).map(([k, v]) => `${k} ${v}`).join(", ")}`);
ok.push(`${TASKS.length} radio tasks, ${VENDING.length} vending items, ${MOOD_MARKS.length} mood beats`);
ok.push(`${followUps.length} of them are follow-ups gated on an earlier choice`);
const moodless = STORIES.filter((s) => s.choices.every((c) => c.mood === undefined));
if (moodless.length) ok.push(`${moodless.length} stories move mood not at all -- check that is deliberate`);

for (const line of ok) console.log("  ·", line);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗", p);
  process.exit(1);
}
console.log("\ncontent ok");
