"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "@/game/engine";
import { audio } from "@/game/audio";
import { GAME_W, GAME_H, type GameState, type ShiftRecord } from "@/game/types";

export default function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [phase, setPhase] = useState<GameState["phase"]>("boot");
  const [status, setStatus] = useState("");
  const [handover, setHandover] = useState<GameState | null>(null);
  const [leave, setLeave] = useState(0);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [record, setRecord] = useState<ShiftRecord | null>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = GAME_W;
    canvas.height = GAME_H;

    const game = new Game(canvas, {
      onPhase: setPhase,
      onStatus: setStatus,
      onHandover: (s) => {
        setHandover(s);
        setLeave(Math.floor(s.coins / 2));
      },
    });
    gameRef.current = game;
    // a handle for driving the game from a console or a browser-automation
    // script; development only, so it never ships
    if (process.env.NODE_ENV === "development") {
      (window as unknown as { __shift?: Game }).__shift = game;
    }
    game.boot().catch((e) => setStatus(`could not start: ${e.message}`));
    return () => game.destroy();
  }, []);

  const submit = useCallback(async () => {
    const game = gameRef.current;
    if (!game || sending) return;
    setSending(true);
    await game.submitHandover(leave, msg.trim());
    setRecord(game.record);
    setHandover(null);
    setSending(false);
  }, [leave, msg, sending]);

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    audio.setMuted(m);
  };

  return (
    <div className="shell">
      <div className="frame">
        <canvas ref={canvasRef} className="screen" />
        {handover && (
          <div className="overlay">
            <div className="card">
              <h2>WHAT DO YOU LEAVE IN THE LOCKER?</h2>
              <p className="lede">
                You are holding {handover.coins} coins. Whoever opens locker 14 tomorrow
                night starts with whatever is still on the shelf.
              </p>

              <label className="row">
                <span>leave behind</span>
                <input
                  type="range"
                  min={0}
                  max={handover.coins}
                  value={leave}
                  onChange={(e) => setLeave(Number(e.target.value))}
                />
                <b>{leave}</b>
              </label>
              <div className="split">
                <span>you keep {handover.coins - leave}</span>
                <span>they start with {leave}</span>
              </div>

              <label className="field">
                <span>leave a message on the walkie-talkie · {140 - msg.length}</span>
                <textarea
                  maxLength={140}
                  rows={3}
                  value={msg}
                  placeholder="Don't trust the machine. Room 3 needs someone at four."
                  onChange={(e) => setMsg(e.target.value)}
                />
              </label>

              <button onClick={submit} disabled={sending}>
                {sending ? "recording…" : "CLOCK OUT"}
              </button>
            </div>
          </div>
        )}

        {phase === "done" && record && (
          <div className="overlay">
            <div className="card done">
              <h2>SHIFT #{record.shift} HANDED OVER</h2>
              <p className="lede">
                {record.leftCoins} coins and one message are waiting for the next player.
              </p>
              {record.explorer ? (
                <a href={record.explorer} target="_blank" rel="noreferrer">
                  view the transaction on solana devnet →
                </a>
              ) : (
                <p className="warn">
                  devnet was not configured, so this was recorded on a local ledger.
                </p>
              )}
              <button onClick={() => location.reload()}>TAKE THE NEXT SHIFT</button>
            </div>
          </div>
        )}
      </div>

      <div className="bar">
        <span className="status">{status}</span>
        <button className="mute" onClick={toggleMute}>{muted ? "SOUND OFF" : "SOUND ON"}</button>
      </div>
    </div>
  );
}
