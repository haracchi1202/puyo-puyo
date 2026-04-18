'use client';

import { useReducer, useEffect, useMemo, useCallback, memo } from 'react';
import type { Board, Cell, PuyoColor, ActivePiece, GameState, GamePhase } from './types';
import {
  BOARD_WIDTH, BOARD_HEIGHT, CLEAR_ANIM_MS,
  createEmptyBoard, randomPair, createActivePiece,
  canPieceFit, rotateCW, rotateCCW,
  lockPiece, applyGravity, findClearGroups,
  removeCells, calcScore, dropSpeed,
} from './logic';

// ─── Visual config ────────────────────────────────────────────────────────────

const COLOR_CFG: Record<PuyoColor, { grad: string; dark: string; glow: string }> = {
  red:    { grad: 'radial-gradient(circle at 33% 33%, #ff8787, #c92a2a)', dark: '#c92a2a', glow: '#ff6b6b55' },
  green:  { grad: 'radial-gradient(circle at 33% 33%, #8ce99a, #2f9e44)', dark: '#2f9e44', glow: '#51cf6655' },
  blue:   { grad: 'radial-gradient(circle at 33% 33%, #74c0fc, #1864ab)', dark: '#1864ab', glow: '#339af055' },
  yellow: { grad: 'radial-gradient(circle at 33% 33%, #ffe066, #f08c00)', dark: '#f08c00', glow: '#ffd43b55' },
  purple: { grad: 'radial-gradient(circle at 33% 33%, #da77f2, #6741d9)', dark: '#6741d9', glow: '#cc5de855' },
};

const CS = 44;   // cell size px
const GAP = 2;   // grid gap px
const INSET = 4; // circle inset px
const CONN = 16; // connection bridge width px

// ─── Reducer ─────────────────────────────────────────────────────────────────

type Action =
  | { type: 'START' | 'RESTART' | 'TICK' | 'CLEAR_TICK' }
  | { type: 'MOVE'; dir: 'left' | 'right' | 'down' }
  | { type: 'ROTATE'; dir: 'cw' | 'ccw' }
  | { type: 'HARD_DROP' };

function initState(): GameState {
  return {
    board: createEmptyBoard(),
    activePiece: null,
    nextColors: randomPair(),
    score: 0, level: 0, chain: 0, maxChain: 0,
    phase: 'idle',
    clearingCells: [],
  };
}

function spawnPiece(state: GameState): GameState {
  const [mainColor, subColor] = state.nextColors;
  const nextColors = randomPair();
  const activePiece = createActivePiece(mainColor, subColor);
  if (!canPieceFit(state.board, activePiece))
    return { ...state, activePiece: null, nextColors, phase: 'gameover' };
  return { ...state, activePiece, nextColors, chain: 0, phase: 'dropping' };
}

function afterLock(state: GameState, rawBoard: Board): GameState {
  const board = applyGravity(rawBoard);
  const groups = findClearGroups(board);
  if (groups.length === 0) return spawnPiece({ ...state, board, chain: 0 });
  return {
    ...state, board,
    activePiece: null,
    clearingCells: groups,
    phase: 'clearAnimation',
  };
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'START':   return spawnPiece(initState());
    case 'RESTART': return spawnPiece(initState());

    case 'TICK': {
      if (state.phase !== 'dropping' || !state.activePiece) return state;
      const p = state.activePiece;
      if (canPieceFit(state.board, p, 0, 1))
        return { ...state, activePiece: { ...p, mainY: p.mainY + 1, subY: p.subY + 1 } };
      return afterLock(state, lockPiece(state.board, p));
    }

    case 'CLEAR_TICK': {
      if (state.phase !== 'clearAnimation') return state;
      const cells = state.clearingCells;
      const board = applyGravity(removeCells(state.board, cells));
      const chain = state.chain + 1;
      const score = state.score + calcScore(chain, cells.length);
      const level = Math.floor(score / 2000);
      const maxChain = Math.max(state.maxChain, chain);
      const base = { ...state, board, score, level, chain, maxChain, clearingCells: [] as { x: number; y: number }[], phase: 'dropping' as GamePhase };
      const more = findClearGroups(board);
      if (more.length > 0)
        return { ...base, clearingCells: more, phase: 'clearAnimation' };
      return spawnPiece(base);
    }

    case 'MOVE': {
      if (state.phase !== 'dropping' || !state.activePiece) return state;
      const p = state.activePiece;
      if (action.dir === 'left') {
        if (!canPieceFit(state.board, p, -1, 0)) return state;
        return { ...state, activePiece: { ...p, mainX: p.mainX - 1, subX: p.subX - 1 } };
      }
      if (action.dir === 'right') {
        if (!canPieceFit(state.board, p, 1, 0)) return state;
        return { ...state, activePiece: { ...p, mainX: p.mainX + 1, subX: p.subX + 1 } };
      }
      // down
      if (!canPieceFit(state.board, p, 0, 1)) return afterLock(state, lockPiece(state.board, p));
      return { ...state, activePiece: { ...p, mainY: p.mainY + 1, subY: p.subY + 1 } };
    }

    case 'ROTATE': {
      if (state.phase !== 'dropping' || !state.activePiece) return state;
      const fn = action.dir === 'cw' ? rotateCW : rotateCCW;
      return { ...state, activePiece: fn(state.board, state.activePiece) };
    }

    case 'HARD_DROP': {
      if (state.phase !== 'dropping' || !state.activePiece) return state;
      let p = state.activePiece;
      while (canPieceFit(state.board, p, 0, 1)) p = { ...p, mainY: p.mainY + 1, subY: p.subY + 1 };
      return afterLock(state, lockPiece(state.board, p));
    }

    default: return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

function usePuyoGame() {
  const [state, dispatch] = useReducer(reducer, undefined, initState);

  useEffect(() => {
    if (state.phase !== 'dropping') return;
    const id = setInterval(() => dispatch({ type: 'TICK' }), dropSpeed(state.level));
    return () => clearInterval(id);
  }, [state.phase, state.level]);

  useEffect(() => {
    if (state.phase !== 'clearAnimation') return;
    const id = setTimeout(() => dispatch({ type: 'CLEAR_TICK' }), CLEAR_ANIM_MS);
    return () => clearTimeout(id);
  }, [state.phase, state.clearingCells]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); dispatch({ type: 'MOVE', dir: 'left' }); break;
        case 'ArrowRight': e.preventDefault(); dispatch({ type: 'MOVE', dir: 'right' }); break;
        case 'ArrowDown':  e.preventDefault(); dispatch({ type: 'MOVE', dir: 'down' }); break;
        case 'ArrowUp':    e.preventDefault(); dispatch({ type: 'ROTATE', dir: 'cw' }); break;
        case 'z': case 'Z': dispatch({ type: 'ROTATE', dir: 'ccw' }); break;
        case 'x': case 'X': dispatch({ type: 'ROTATE', dir: 'cw' }); break;
        case ' ': e.preventDefault(); dispatch({ type: 'HARD_DROP' }); break;
        case 'Enter':
          if (state.phase === 'idle') dispatch({ type: 'START' });
          else if (state.phase === 'gameover') dispatch({ type: 'RESTART' });
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.phase]);

  const start = useCallback(() => dispatch({ type: 'START' }), []);
  const restart = useCallback(() => dispatch({ type: 'RESTART' }), []);
  return { state, start, restart };
}

// ─── PuyoCell ─────────────────────────────────────────────────────────────────

interface PuyoCellProps {
  color: PuyoColor;
  isClearing?: boolean;
  isGhost?: boolean;
  top?: boolean; bottom?: boolean; left?: boolean; right?: boolean;
}

const PuyoCell = memo(function PuyoCell({ color, isClearing, isGhost, top, bottom, left, right }: PuyoCellProps) {
  const c = COLOR_CFG[color];
  return (
    <div style={{ width: CS, height: CS, position: 'relative', animation: isClearing ? `puyoClear ${CLEAR_ANIM_MS}ms ease-in-out infinite alternate` : undefined }}>
      {top    && !isGhost && <div style={{ position: 'absolute', left: (CS - CONN) / 2, top: 0,    width: CONN, height: CS / 2 + INSET, background: c.dark }} />}
      {bottom && !isGhost && <div style={{ position: 'absolute', left: (CS - CONN) / 2, bottom: 0, width: CONN, height: CS / 2 + INSET, background: c.dark }} />}
      {left   && !isGhost && <div style={{ position: 'absolute', top: (CS - CONN) / 2, left: 0,   width: CS / 2 + INSET, height: CONN, background: c.dark }} />}
      {right  && !isGhost && <div style={{ position: 'absolute', top: (CS - CONN) / 2, right: 0,  width: CS / 2 + INSET, height: CONN, background: c.dark }} />}
      <div style={{
        position: 'absolute', inset: INSET, borderRadius: '50%', zIndex: 1,
        background: isGhost ? `${c.dark}44` : c.grad,
        boxShadow: isGhost ? 'none' : `0 2px 10px ${c.glow}, inset 0 -2px 4px rgba(0,0,0,0.25)`,
        border: isGhost ? `2px solid ${c.dark}88` : 'none',
      }}>
        {!isGhost && (
          <>
            <div style={{ position: 'absolute', top: '14%', left: '18%', width: '32%', height: '26%', borderRadius: '50%', background: 'rgba(255,255,255,0.5)' }} />
            <div style={{ position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%,-50%)', display: 'flex', gap: 4 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(0,0,0,0.85)' }} />
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(0,0,0,0.85)' }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
});

// ─── MiniPuyo ─────────────────────────────────────────────────────────────────

function MiniPuyo({ color }: { color: PuyoColor }) {
  const c = COLOR_CFG[color];
  return (
    <div style={{ width: 34, height: 34, borderRadius: '50%', background: c.grad, boxShadow: `0 2px 10px ${c.glow}`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: '14%', left: '18%', width: '32%', height: '26%', borderRadius: '50%', background: 'rgba(255,255,255,0.5)' }} />
    </div>
  );
}

// ─── GameBoardView ────────────────────────────────────────────────────────────

function getGhost(board: Board, piece: ActivePiece): ActivePiece {
  let g = piece;
  while (canPieceFit(board, g, 0, 1)) g = { ...g, mainY: g.mainY + 1, subY: g.subY + 1 };
  return g;
}

const GameBoardView = memo(function GameBoardView({ state }: { state: GameState }) {
  const { board, activePiece, clearingCells, phase } = state;
  const clearSet = useMemo(() => new Set(clearingCells.map(c => `${c.x},${c.y}`)), [clearingCells]);

  const activeMap = useMemo(() => {
    const m = new Map<string, PuyoColor>();
    if (activePiece) {
      m.set(`${activePiece.mainX},${activePiece.mainY}`, activePiece.mainColor);
      m.set(`${activePiece.subX},${activePiece.subY}`, activePiece.subColor);
    }
    return m;
  }, [activePiece]);

  const ghostMap = useMemo(() => {
    const m = new Map<string, PuyoColor>();
    if (activePiece && phase === 'dropping') {
      const g = getGhost(board, activePiece);
      if (g.mainY !== activePiece.mainY || g.subY !== activePiece.subY) {
        m.set(`${g.mainX},${g.mainY}`, g.mainColor);
        m.set(`${g.subX},${g.subY}`, g.subColor);
      }
    }
    return m;
  }, [board, activePiece, phase]);

  const display = useMemo(() => {
    const d: (Cell)[][] = board.map(r => [...r]);
    activeMap.forEach((color, key) => {
      const [x, y] = key.split(',').map(Number);
      if (y >= 0 && y < BOARD_HEIGHT) d[y][x] = color;
    });
    return d;
  }, [board, activeMap]);

  function conn(x: number, y: number, color: PuyoColor) {
    return {
      top:    y > 0 && display[y-1][x] === color,
      bottom: y < BOARD_HEIGHT-1 && display[y+1][x] === color,
      left:   x > 0 && display[y][x-1] === color,
      right:  x < BOARD_WIDTH-1 && display[y][x+1] === color,
    };
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${BOARD_WIDTH}, ${CS}px)`, gridTemplateRows: `repeat(${BOARD_HEIGHT}, ${CS}px)`, gap: GAP }}>
      {Array.from({ length: BOARD_HEIGHT }, (_, y) =>
        Array.from({ length: BOARD_WIDTH }, (_, x) => {
          const key = `${x},${y}`;
          const dc = display[y][x];
          const gc = ghostMap.get(key);
          return (
            <div key={key} style={{ width: CS, height: CS, position: 'relative', background: 'rgba(255,255,255,0.03)', borderRadius: 3 }}>
              {gc && !dc && <div style={{ position: 'absolute', inset: 0 }}><PuyoCell color={gc} isGhost /></div>}
              {dc && <div style={{ position: 'absolute', inset: 0 }}><PuyoCell color={dc} isClearing={clearSet.has(key)} {...conn(x, y, dc)} /></div>}
            </div>
          );
        })
      )}
    </div>
  );
});

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '12px 16px' }}>
      <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 5 }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function PuyoGame() {
  const { state, start, restart } = usePuyoGame();
  const { phase, score, level, chain, maxChain, nextColors } = state;

  const boardW = BOARD_WIDTH * CS + (BOARD_WIDTH - 1) * GAP;
  const boardH = BOARD_HEIGHT * CS + (BOARD_HEIGHT - 1) * GAP;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #050511 0%, #0a1628 50%, #050511 100%)', padding: 24, userSelect: 'none' }}>
      <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 20, background: 'linear-gradient(90deg, #ff6b6b, #ffd43b, #51cf66, #74c0fc, #cc5de8, #ff6b6b)', backgroundSize: '200%', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', animation: 'rainbowShift 4s linear infinite' }}>
        ぷよぷよ
      </h1>

      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        {/* Board */}
        <div style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', borderRadius: 16, padding: 12, border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', position: 'relative', width: boardW + 24, height: boardH + 24 }}>
          <GameBoardView state={state} />

          {phase === 'idle' && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.78)', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              <div style={{ fontSize: 52 }}>🎮</div>
              <div style={{ color: '#fff', fontSize: 17, fontWeight: 800, letterSpacing: '0.05em' }}>PRESS ENTER</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>to start</div>
            </div>
          )}

          {phase === 'gameover' && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.82)', borderRadius: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <div style={{ color: '#ff6b6b', fontSize: 30, fontWeight: 900, textShadow: '0 0 20px #ff6b6b88' }}>GAME OVER</div>
              <div style={{ color: '#ffd43b', fontSize: 22, fontWeight: 900, textShadow: '0 0 16px #ffd43b88' }}>{score.toLocaleString()}</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 8 }}>ENTER でリトライ</div>
            </div>
          )}

          {phase === 'clearAnimation' && (
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: 44, fontWeight: 900, color: '#ffd43b', textShadow: '0 0 24px #ffd43b, 0 0 48px #ffd43b88', animation: `chainPop ${CLEAR_ANIM_MS}ms ease-out`, whiteSpace: 'nowrap' }}>
                {chain + 1}連鎖！
              </div>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 130 }}>
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 10 }}>NEXT</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <MiniPuyo color={nextColors[1]} />
              <MiniPuyo color={nextColors[0]} />
            </div>
          </div>

          <StatCard label="SCORE" value={score.toLocaleString()} color="#ffd43b" />
          <StatCard label="LEVEL" value={level + 1} color="#74c0fc" />
          <StatCard label="MAX CHAIN" value={maxChain} color="#cc5de8" />

          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '10px 14px', fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 2 }}>
            <div>← →　移動</div>
            <div>↑ / X　右回転</div>
            <div>Z　左回転</div>
            <div>↓　低速落下</div>
            <div>Space　一気落下</div>
          </div>
        </div>
      </div>
    </div>
  );
}
