export type PuyoColor = 'red' | 'green' | 'blue' | 'yellow' | 'purple';
export type Cell = PuyoColor | null;
export type Board = Cell[][];

export interface ActivePiece {
  mainX: number;
  mainY: number;
  subX: number;
  subY: number;
  mainColor: PuyoColor;
  subColor: PuyoColor;
}

export type GamePhase = 'idle' | 'dropping' | 'clearAnimation' | 'gameover';

export interface GameState {
  board: Board;
  activePiece: ActivePiece | null;
  nextColors: [PuyoColor, PuyoColor];
  score: number;
  level: number;
  chain: number;
  maxChain: number;
  phase: GamePhase;
  clearingCells: { x: number; y: number }[];
}
