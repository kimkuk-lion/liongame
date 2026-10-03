import { GAME_HEIGHT, GAME_WIDTH, MOVE_DURATION, MOVE_RANDOM } from "./constants";

type Hole = {
  id: number;
  x: number;
  y: number;
};

type Marble = {
  id: number;
  x: number;
  y: number;
  lion: boolean;
  hole: number;
  alive: boolean;
  inHole: boolean;
};

const HOLES: Hole[] = [
  { id: 0, x: 300, y: 950 },
  { id: 1, x: 300, y: 700 },
  { id: 2, x: 300, y: 400 },
  { id: 3, x: 500, y: 400 },
  { id: 4, x: 100, y: 400 },
  { id: 5, x: 300, y: 150 },
];

type RenderArgs = {
  turn: number;
  marbles: Marble[];
  holes: Hole[];
  state: State;
};

type RenderFunction = (args: RenderArgs) => void;
type State = "wait_move" | "moving";

const MARBLE_RADIUS = 25 / 2;
const HOLE_RADIUS = 35 / 2;

export class System {
  private turn: number = 0;
  private marbles: Marble[];
  private holes: Hole[] = HOLES;
  private state: State = "wait_move";
  debugInfo: string;

  constructor(private marbleCount: number, private renderFunction: RenderFunction) {
    this.marbles = [];
    for (let i = 0; i < marbleCount; i += 1) {
      this.marbles.push({
        id: i,
        hole: 0,
        lion: false,
        x: 100 + i * 130,
        y: 1200,
        alive: true,
        inHole: true,
      });
    }
    this.debugInfo = `r:${MOVE_RANDOM}`;
  }

  moveMarble(x: number, y: number) {
    x = randomNumber(x - MOVE_RANDOM, x + MOVE_RANDOM);
    y = randomNumber(y - MOVE_RANDOM, y + MOVE_RANDOM);
    x = clamp(x, 10, GAME_WIDTH - 10);
    y = clamp(y, 10, GAME_HEIGHT - 10);
    if (this.state !== "wait_move") {
      throw Error("not wait_move");
    }
    this.state = "moving";
    const marble = this.marbles[this.turn];
    marble.inHole = false;
    const startX = marble.x;
    const startY = marble.y;
    let i = 0;
    const max = 30;
    const duration = MOVE_DURATION;
    const f = () => {
      i += 1;
      marble.x = startX + ((x - startX) / max) * i;
      marble.y = startY + ((y - startY) / max) * i;
      if (this.checkCollision(marble)) {
        this.state = "wait_move";
        this.nextTurn();
        this.render();
        return;
      }

      if (i !== max) {
        this.render();
        setTimeout(f, duration / max);
        return;
      }
      this.state = "wait_move";
      this.nextTurn();
      this.render();
    };
    f();
  }

  private nextTurn() {
    this.turn += 1;
    if (this.turn === this.marbleCount) {
      this.turn = 0;
    }
    const turnMarble = this.marbles[this.turn];
    if (!turnMarble.alive) {
      this.nextTurn();
    }
  }

  private checkCollision(marble: Marble): boolean {
    if (!marble.lion) {
      const targetHole = this.holes[marble.hole];

      if (collision(targetHole.x, targetHole.y, marble.x, marble.y, HOLE_RADIUS, MARBLE_RADIUS)) {
        this.nextHole(marble);
        return true;
      }
    }

    for (const otherMarble of this.marbles) {
      if (otherMarble.id === marble.id || otherMarble.inHole || !otherMarble.alive) {
        continue;
      }
      if (
        collision(otherMarble.x, otherMarble.y, marble.x, marble.y, MARBLE_RADIUS, MARBLE_RADIUS)
      ) {
        if (marble.lion) {
          otherMarble.alive = false;
          return true;
        }

        if (otherMarble.lion) {
          marble.alive = false;
          return true;
        }

        this.nextHole(marble);

        return true;
      }
    }
    return false;
  }

  private nextHole(marble: Marble) {
    const targetHole = this.holes[marble.hole];
    marble.inHole = true;
    marble.x = targetHole.x;
    marble.y = targetHole.y;
    marble.hole += 1;
    if (marble.hole === this.holes.length) {
      marble.lion = true;
    }
  }

  render() {
    this.renderFunction({
      turn: this.turn,
      holes: this.holes,
      marbles: this.marbles,
      state: this.state,
    });
  }
}

function collision(x1: number, y1: number, x2: number, y2: number, d1: number, d2: number) {
  const distance = Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
  return distance <= d1 + d2;
}

function randomNumber(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function clamp(v: number, min: number, max: number) {
  if (v < min) {
    return min;
  }
  if (v > max) {
    return max;
  }
  return v;
}
