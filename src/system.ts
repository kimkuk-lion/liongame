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
  visitedHoles: number[]; 
  kills: number; 
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
const HOLE_RADIUS = MARBLE_RADIUS * 1.5; 

export class System {
  private turn: number = 0;
  private marbles: Marble[];
  private holes: Hole[] = HOLES;
  private state: State = "wait_move";
  debugInfo: string;

  constructor(
    private marbleCount: number, 
    private renderFunction: RenderFunction,
    private onCollisionCallback?: () => void 
  ) {
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
        visitedHoles: [],
        kills: 0, 
      });
    }
    this.debugInfo = `distSD:25%`;
  }

  moveMarble(x: number, y: number) {
    if (this.state !== "wait_move") {
      throw Error("not wait_move");
    }

    const marble = this.marbles[this.turn];
    const startX = marble.x;
    const startY = marble.y;

    const closeThreshold = 50;
    let closeMarble: Marble | null = null;

    for (const other of this.marbles) {
      if (other.id === marble.id || !other.alive || other.inHole) continue;
      
      const dist = Math.sqrt(Math.pow(other.x - marble.x, 2) + Math.pow(other.y - marble.y, 2));
      if (dist <= closeThreshold) {
        closeMarble = other;
        break;
      }
    }

    if (closeMarble) {
      if (this.onCollisionCallback) {
        this.onCollisionCallback(); 
      }

      if (marble.lion) {
        closeMarble.alive = false;
        marble.kills += 1;
        this.handleDirectJump(marble); 
        this.state = "wait_move";
        this.nextTurn();
        this.render();
        return;
      }

      const reflectAngle = Math.atan2(y - closeMarble.y, x - closeMarble.x);
      let targetX = closeMarble.x + Math.cos(reflectAngle) * 250;
      let targetY = closeMarble.y + Math.sin(reflectAngle) * 250;

      targetX = clamp(targetX, 15, GAME_WIDTH - 15);
      targetY = clamp(targetY, 15, GAME_HEIGHT - 15);

      if (closeMarble.lion) {
        this.handleDirectJump(marble); 
      } else {
        this.handleDirectJump(marble); 
        closeMarble.inHole = false; 
      }

      this.state = "moving";
      let step = 0;
      const maxStep = 15;
      const startOX = closeMarble.x;
      const startOY = closeMarble.y;

      const slide = () => {
        step += 1;
        if (!closeMarble!.lion) {
          closeMarble!.x = startOX + ((targetX - startOX) / maxStep) * step;
          closeMarble!.y = startOY + ((targetY - startOY) / maxStep) * step;
        }

        this.render();

        if (step < maxStep) {
          setTimeout(slide, MOVE_DURATION / maxStep);
        } else {
          this.state = "wait_move";
          this.nextTurn();
          this.render();
        }
      };
      
      slide();
      return; 
    }

    const dx = x - startX;
    const dy = y - startY;
    const targetDistance = Math.sqrt(dx * dx + dy * dy);
    const targetAngle = Math.atan2(dy, dx);

    const distanceStdDev = targetDistance * 0.25;  
    const angleStdDev = 10 * (Math.PI / 180);       

    const minDistance = Math.max(10, targetDistance - distanceStdDev * 4);
    const actualDistance = randomNormalBounded(targetDistance, distanceStdDev, minDistance, Infinity);
    const actualAngle = randomNormalBounded(targetAngle, angleStdDev, -Infinity, Infinity);

    x = startX + actualDistance * Math.cos(actualAngle);
    y = startY + actualDistance * Math.sin(actualAngle);

    x = clamp(x, 10, GAME_WIDTH - 10);
    y = clamp(y, 10, GAME_HEIGHT - 10);

    this.state = "moving";
    marble.inHole = false;
    
    let i = 0;
    const max = 30;
    const duration = MOVE_DURATION;
    
    const f = () => {
      i += 1;
      marble.x = startX + ((x - startX) / max) * i;
      marble.y = startY + ((y - startY) / max) * i;
      
      if (this.checkCollision(marble, x, y)) {
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

  private checkCollision(marble: Marble, clickX: number, clickY: number): boolean {
    if (!marble.lion) {
      let collidedHoleId = -1;

      if (marble.hole === 3 && !marble.visitedHoles.includes(3) && !marble.visitedHoles.includes(4)) {
        if (collision(this.holes[3].x, this.holes[3].y, marble.x, marble.y, HOLE_RADIUS, MARBLE_RADIUS)) {
          collidedHoleId = 3;
        } else if (collision(this.holes[4].x, this.holes[4].y, marble.x, marble.y, HOLE_RADIUS, MARBLE_RADIUS)) {
          collidedHoleId = 4;
        }
      } else {
        const targetHole = this.holes[marble.hole];
        if (collision(targetHole.x, targetHole.y, marble.x, marble.y, HOLE_RADIUS, MARBLE_RADIUS)) {
          collidedHoleId = marble.hole;
        }
      }

      if (collidedHoleId !== -1) {
        marble.hole = collidedHoleId; 
        this.nextHole(marble);        
        this.state = "wait_move";
        this.nextTurn();
        this.render();
        return true;
      }
    }

    for (const otherMarble of this.marbles) {
      if (otherMarble.id === marble.id || !otherMarble.alive) {
        continue;
      }

      if (otherMarble.inHole) {
        continue;
      }

      if (collision(otherMarble.x, otherMarble.y, marble.x, marble.y, MARBLE_RADIUS, MARBLE_RADIUS)) {
        if (this.onCollisionCallback) {
          this.onCollisionCallback();
        }

        if (marble.lion) {
          otherMarble.alive = false;
          marble.kills += 1; 
          this.state = "wait_move";
          this.nextTurn();
          this.render();
          return true;
        } 
        
        const reflectAngle = Math.atan2(otherMarble.y - marble.y, otherMarble.x - marble.x);
        const pushDx = clickX - otherMarble.x;
        const pushDy = clickY - otherMarble.y;
        let pushDistance = Math.sqrt(pushDx * pushDx + pushDy * pushDy);
        
        if (pushDistance > 250) pushDistance = 250;

        let targetX = otherMarble.x + Math.cos(reflectAngle) * pushDistance;
        let targetY = otherMarble.y + Math.sin(reflectAngle) * pushDistance;
        
        targetX = clamp(targetX, 15, GAME_WIDTH - 15);
        targetY = clamp(targetY, 15, GAME_HEIGHT - 15);

        if (otherMarble.lion) {
          this.handleDirectJump(marble); 
        } else {
          this.handleDirectJump(marble); 
          otherMarble.inHole = false;    
        }

        let step = 0;
        const maxStep = 15;
        const startOX = otherMarble.x;
        const startOY = otherMarble.y;

        const slide = () => {
          step += 1;
          if (!otherMarble.lion) { 
            otherMarble.x = startOX + ((targetX - startOX) / maxStep) * step;
            otherMarble.y = startOY + ((targetY - startOY) / maxStep) * step;
          }

          this.render();

          if (step < maxStep) {
            setTimeout(slide, MOVE_DURATION / maxStep);
          } else {
            this.state = "wait_move";
            this.nextTurn();
            this.render();
          }
        };
        
        slide();
        return true;
      }
    }
    return false;
  }

  private handleDirectJump(marble: Marble) {
    if (marble.hole === 3 && !marble.visitedHoles.includes(3) && !marble.visitedHoles.includes(4)) {
      marble.hole = 3;
    }
    this.nextHole(marble);
  }

  private nextHole(marble: Marble) {
    const currentTarget = marble.hole;
    
    if (!marble.visitedHoles.includes(currentTarget)) {
      marble.visitedHoles.push(currentTarget);
    }

    const targetHole = this.holes[currentTarget];
    marble.inHole = true;
    marble.x = targetHole.x;
    marble.y = targetHole.y;

    if (currentTarget === 0) marble.hole = 1;
    else if (currentTarget === 1) marble.hole = 2;
    else if (currentTarget === 2) {
      const visited3 = marble.visitedHoles.includes(3);
      const visited4 = marble.visitedHoles.includes(4);
      if (!visited3 && !visited4) marble.hole = 3; 
      else if (visited3 && !visited4) marble.hole = 4; 
      else if (!visited3 && visited4) marble.hole = 3; 
      else marble.hole = 5; 
    } 
    else if (currentTarget === 3 || currentTarget === 4) marble.hole = 2; 
    else if (currentTarget === 5) marble.lion = true; 
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

function clamp(v: number, min: number, max: number) {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function randomNormalBounded(mean: number, stdDev: number, min: number, max: number): number {
  let value;
  let attempts = 0;
  do {
    const u1 = Math.random();
const u2 = Math.random();
const randStdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
value = mean + stdDev * randStdNormal;
attempts++;
} while ((value < min || value > max) && attempts < 10);
if (value < min) return min;
if (value > max) return max;
return value;
}