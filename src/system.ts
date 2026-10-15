import { GAME_HEIGHT, GAME_WIDTH, MOVE_DURATION } from "./constants";

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
  currentHole: number | null;
  deployed: boolean;
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
  activeMarbleId: number | null;
  turnOrder: number[];
  orderEstablished: boolean;
  marbles: Marble[];
  holes: Hole[];
  state: State;
};

type RenderFunction = (args: RenderArgs) => void;
type State =
  | "ready"
  | "wait_move"
  | "moving"
  | "moving_to_order_hole"
  | "wait_order_move"
  | "moving_order"
  | "revealing_order";

const MARBLE_RADIUS = 25 / 2;
const HOLE_ENTRY_RADIUS = 10;
const LION_RECOIL_DISTANCE = 70;
const LION_RECOIL_DURATION = 900;
const LION_RECOIL_ANGLE_STDDEV = 8 * (Math.PI / 180);
const ORDER_RESULT_REVEAL_DELAY = 1500;
export const CLOSE_MARBLE_THRESHOLD = 50;

export class System {
  private turn: number = 0;
  private marbles: Marble[];
  private turnOrder: number[];
  private orderCandidates: number[] = [];
  private orderIndex = 0;
  private ordering = false;
  private orderEstablished = false;
  private holes: Hole[] = HOLES;
  private state: State = "ready";

  constructor(
    private marbleCount: number, 
    private renderFunction: RenderFunction,
    private onCollisionCallback?: () => void,
    private onMarbleMoveCallback?: (distance: number) => void
  ) {
    this.marbles = [];
    for (let i = 0; i < marbleCount; i += 1) {
      this.marbles.push({
        id: i,
        hole: 0, 
        currentHole: null,
        deployed: false,
        lion: false,
        x: 445,
        y: 1080 + i * 30,
        alive: true,
        inHole: true,
        visitedHoles: [],
        kills: 0, 
      });
    }
    this.turnOrder = this.marbles.map((marble) => marble.id);
  }

  get hasOrderEstablished() {
    return this.orderEstablished;
  }

  startOrderSelection() {
    if (this.state !== "ready" || this.orderEstablished) {
      return;
    }

    this.ordering = true;
    this.orderCandidates = this.marbles.map((marble) => marble.id);
    this.orderIndex = 0;
    this.sendToOrderHole(this.marbles[this.orderCandidates[0]]);
  }

  startGame() {
    if (this.state !== "ready" || !this.orderEstablished) {
      return;
    }

    const marble = this.marbles[this.turnOrder[this.turn]];
    if (!marble) {
      throw new Error("cannot start a game without marbles");
    }

    this.state = "wait_move";
    this.render();
  }

  private sendToOrderHole(marble: Marble) {
    const startX = 455;
    const startY = 1110 + marble.id * 35;
    const target = this.holes[1];
    const maxStep = 30;
    let step = 0;

    marble.x = startX;
    marble.y = startY;
    marble.hole = 0;
    marble.deployed = true;
    marble.inHole = false;
    this.state = "moving_to_order_hole";
    this.render();

    const moveToHole = () => {
      step += 1;
      const progress = step / maxStep;
      marble.x = startX + (target.x - startX) * progress;
      marble.y = startY + (target.y - startY) * progress;
      this.render();

      if (step < maxStep) {
        setTimeout(moveToHole, MOVE_DURATION / maxStep);
      } else {
        this.state = "wait_order_move";
        this.render();
      }
    };

    moveToHole();
  }

  private completeOrderShot() {
    this.orderIndex += 1;
    if (this.orderIndex < this.orderCandidates.length) {
      this.sendToOrderHole(this.marbles[this.orderCandidates[this.orderIndex]]);
      return;
    }

    this.turnOrder = [...this.marbles]
      .sort((a, b) =>
        this.distanceToHole(a, 0) - this.distanceToHole(b, 0) || b.id - a.id
      )
      .map((marble) => marble.id);

    this.turn = 0;
    this.state = "revealing_order";
    this.render();
    setTimeout(() => {
      this.ordering = false;
      this.orderEstablished = true;
      this.state = "ready";
      this.startGame();
    }, ORDER_RESULT_REVEAL_DELAY);
  }

  private sendToStartLine(marble: Marble) {
    const targetX = GAME_WIDTH / 2;
    const targetY = 1200 + MARBLE_RADIUS;
    const startX = 455;
    const startY = 1110 + this.turnOrder.indexOf(marble.id) * 35;
    let step = 0;
    const maxStep = 30;

    marble.x = startX;
    marble.y = startY;
    marble.deployed = true;
    marble.inHole = false;
    this.state = "moving";
    this.render();

    const moveToStart = () => {
      step += 1;
      const progress = step / maxStep;
      marble.x = startX + (targetX - startX) * progress;
      marble.y = startY + (targetY - startY) * progress;
      this.render();

      if (step < maxStep) {
        setTimeout(moveToStart, MOVE_DURATION / maxStep);
      } else {
        this.state = "wait_move";
        this.render();
      }
    };

    moveToStart();
  }

  moveMarble(x: number, y: number, targetMarbleId?: number) {
    if (this.state !== "wait_move" && this.state !== "wait_order_move") {
      throw Error("not wait_move");
    }

    const isOrderingShot = this.state === "wait_order_move";
    const marble = this.marbles[
      isOrderingShot ? this.orderCandidates[this.orderIndex] : this.turnOrder[this.turn]
    ];
    const startX = marble.x;
    const startY = marble.y;
    const startingHoleId = marble.inHole ? marble.currentHole : null;
    marble.inHole = false;
    marble.currentHole = null;

    let closeMarble: Marble | null = null;

    if (!isOrderingShot && targetMarbleId !== undefined) {
      closeMarble = this.marbles.find((other) =>
        other.id === targetMarbleId &&
        other.id !== marble.id &&
        other.alive &&
        other.deployed &&
        !other.inHole &&
        Math.hypot(other.x - marble.x, other.y - marble.y) <= CLOSE_MARBLE_THRESHOLD
      ) ?? null;
    } else if (!isOrderingShot && marble.lion) {
      for (const other of this.marbles) {
        if (other.id === marble.id || !other.alive || !other.deployed || other.inHole) continue;
        
        const dist = Math.sqrt(Math.pow(other.x - marble.x, 2) + Math.pow(other.y - marble.y, 2));
        if (dist <= CLOSE_MARBLE_THRESHOLD) {
          closeMarble = other;
          break;
        }
      }
    }

    if (closeMarble) {
      if (this.onCollisionCallback) {
        this.onCollisionCallback(); 
      }

      if (marble.lion) {
        const aimX = x - startX;
        const aimY = y - startY;
        this.animateLionCollision(marble, closeMarble, aimX, aimY, isOrderingShot);
        return;
      }

      const reflectAngle = targetMarbleId === undefined
        ? Math.atan2(y - closeMarble.y, x - closeMarble.x)
        : Math.atan2(y, x);
      let targetX = closeMarble.x + Math.cos(reflectAngle) * 250;
      let targetY = closeMarble.y + Math.sin(reflectAngle) * 250;

      targetX = clamp(targetX, 15, GAME_WIDTH - 15);
      targetY = clamp(targetY, 15, GAME_HEIGHT - 15);

      closeMarble.inHole = false;
      this.onMarbleMoveCallback?.(Math.hypot(targetX - closeMarble.x, targetY - closeMarble.y));

      this.state = isOrderingShot ? "moving_order" : "moving";
      let step = 0;
      const maxStep = 15;
      const startOX = closeMarble.x;
      const startOY = closeMarble.y;

      const slide = () => {
        step += 1;
        closeMarble!.x = startOX + ((targetX - startOX) / maxStep) * step;
        closeMarble!.y = startOY + ((targetY - startOY) / maxStep) * step;

        this.render();

        if (step < maxStep) {
          setTimeout(slide, MOVE_DURATION / maxStep);
        } else {
          this.render();
          setTimeout(() => {
            if (isOrderingShot) {
              this.completeOrderShot();
            } else {
              this.handleDirectJump(marble);
              this.state = "wait_move";
              this.nextTurn();
              this.render();
            }
          }, 150);
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
    const angleStdDev = 15 * (Math.PI / 180);       

    const minDistance = targetDistance - distanceStdDev * 3;
    const maxDistance = targetDistance + distanceStdDev * 3;
    const actualDistance = randomNormalBounded(
      targetDistance,
      distanceStdDev,
      minDistance,
      maxDistance
    );
    const actualAngle = randomNormalBounded(targetAngle, angleStdDev, -Infinity, Infinity);

    x = startX + actualDistance * Math.cos(actualAngle);
    y = startY + actualDistance * Math.sin(actualAngle);

    x = clamp(x, 10, GAME_WIDTH - 10);
    y = clamp(y, 10, GAME_HEIGHT - 10);
    this.onMarbleMoveCallback?.(Math.hypot(x - startX, y - startY));

    this.state = isOrderingShot ? "moving_order" : "moving";
    marble.inHole = false;
    
    let i = 0;
    const max = 30;
    const duration = MOVE_DURATION;
    
    const f = () => {
      i += 1;
      const previousX = marble.x;
      const previousY = marble.y;
      marble.x = startX + ((x - startX) / max) * i;
      marble.y = startY + ((y - startY) / max) * i;
      
      if (this.checkCollision(marble, x, y, previousX, previousY, startingHoleId)) {
        return; 
      }

      if (i !== max) {
        this.render();
        setTimeout(f, duration / max);
        return;
      }
      
      if (isOrderingShot) {
        this.completeOrderShot();
      } else {
        this.state = "wait_move";
        this.nextTurn();
        this.render();
      }
    };
    f();
  }

  private nextTurn() {
    this.turn += 1;
    if (this.turn === this.marbleCount) {
      this.turn = 0;
    }
    const turnMarble = this.marbles[this.turnOrder[this.turn]];
    if (!turnMarble.alive) {
      this.nextTurn();
      return;
    }
    if (!turnMarble.deployed) {
      this.sendToStartLine(turnMarble);
    }
  }

  private animateLionCollision(
    lion: Marble,
    victim: Marble,
    aimX: number,
    aimY: number,
    isOrderingShot: boolean
  ) {
    victim.alive = false;
    lion.kills += 1;
    lion.inHole = false;
    lion.currentHole = null;
    this.onMarbleMoveCallback?.(LION_RECOIL_DISTANCE);

    const aimLength = Math.hypot(aimX, aimY);
    const aimDirectionX = aimLength > 0
      ? aimX / aimLength
      : (victim.x - lion.x) / Math.hypot(victim.x - lion.x, victim.y - lion.y);
    const aimDirectionY = aimLength > 0
      ? aimY / aimLength
      : (victim.y - lion.y) / Math.hypot(victim.x - lion.x, victim.y - lion.y);
    const collisionDistance = Math.hypot(victim.x - lion.x, victim.y - lion.y);
    const normalX = collisionDistance > 0
      ? (victim.x - lion.x) / collisionDistance
      : aimDirectionX;
    const normalY = collisionDistance > 0
      ? (victim.y - lion.y) / collisionDistance
      : aimDirectionY;
    const normalSpeed = aimDirectionX * normalX + aimDirectionY * normalY;
    const tangentX = aimDirectionX - normalSpeed * normalX;
    const tangentY = aimDirectionY - normalSpeed * normalY;
    const tangentLength = Math.hypot(tangentX, tangentY);
    const deflectionAngle = tangentLength > 0.12
      ? Math.atan2(tangentY, tangentX)
      : Math.atan2(aimDirectionY, aimDirectionX) + Math.PI;
    const angle = randomNormalBounded(
      deflectionAngle,
      LION_RECOIL_ANGLE_STDDEV,
      -Infinity,
      Infinity
    );

    const startX = lion.x;
    const startY = lion.y;
    const targetX = clamp(
      startX + Math.cos(angle) * LION_RECOIL_DISTANCE,
      15,
      GAME_WIDTH - 15
    );
    const targetY = clamp(
      startY + Math.sin(angle) * LION_RECOIL_DISTANCE,
      15,
      GAME_HEIGHT - 15
    );
    const maxStep = 24;
    let step = 0;
    this.state = "moving";
    this.render();

    const recoil = () => {
      step += 1;
      const progress = step / maxStep;
      lion.x = startX + (targetX - startX) * progress;
      lion.y = startY + (targetY - startY) * progress;
      this.render();

      if (step < maxStep) {
        setTimeout(recoil, LION_RECOIL_DURATION / maxStep);
        return;
      }

      setTimeout(() => {
        if (isOrderingShot) {
          this.completeOrderShot();
        } else {
          this.state = "wait_move";
          this.nextTurn();
          this.render();
        }
      }, 300);
    };

    recoil();
  }

  private checkCollision(
    marble: Marble,
    clickX: number,
    clickY: number,
    previousX: number,
    previousY: number,
    startingHoleId: number | null
  ): boolean {
    if (this.ordering) {
      const firstHole = this.holes[0];
      if (collision(firstHole.x, firstHole.y, marble.x, marble.y, HOLE_ENTRY_RADIUS, 0)) {
        marble.hole = firstHole.id;
        this.nextHole(marble);
        this.completeOrderShot();
        return true;
      }
    } else if (!marble.lion) {
      const collidedHole = this.holes.find((hole) =>
        collision(hole.x, hole.y, marble.x, marble.y, HOLE_ENTRY_RADIUS, 0) &&
        !(
          hole.id === startingHoleId &&
          collision(hole.x, hole.y, previousX, previousY, HOLE_ENTRY_RADIUS, 0)
        )
      );

      if (collidedHole) {
        const isChoosingFork =
          marble.hole === 3 &&
          !marble.visitedHoles.includes(3) &&
          !marble.visitedHoles.includes(4);
        const isTargetHole =
          collidedHole.id === marble.hole ||
          (isChoosingFork && (collidedHole.id === 3 || collidedHole.id === 4));

        if (isTargetHole) {
          marble.hole = collidedHole.id;
          this.nextHole(marble);
        } else {
          const approachX = previousX - collidedHole.x;
          const approachY = previousY - collidedHole.y;
          const approachLength = Math.hypot(approachX, approachY);
          const movementX = clickX - previousX;
          const movementY = clickY - previousY;
          const movementLength = Math.hypot(movementX, movementY);
          const offsetDistance = HOLE_ENTRY_RADIUS + MARBLE_RADIUS + 3;
          const directionX = approachLength > 0
            ? approachX / approachLength
            : movementLength > 0
              ? -movementX / movementLength
              : 0;
          const directionY = approachLength > 0
            ? approachY / approachLength
            : movementLength > 0
              ? -movementY / movementLength
              : -1;
          marble.x = collidedHole.x + directionX * offsetDistance;
          marble.y = collidedHole.y + directionY * offsetDistance;
          marble.inHole = false;
          marble.currentHole = null;
        }

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
      if (!otherMarble.deployed) {
        continue;
      }

      if (collision(otherMarble.x, otherMarble.y, marble.x, marble.y, MARBLE_RADIUS, MARBLE_RADIUS)) {
        if (this.onCollisionCallback) {
          this.onCollisionCallback();
        }

        if (marble.lion) {
          this.animateLionCollision(
            marble,
            otherMarble,
            clickX - marble.x,
            clickY - marble.y,
            this.ordering
          );
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

        otherMarble.inHole = false;
        this.onMarbleMoveCallback?.(Math.hypot(targetX - otherMarble.x, targetY - otherMarble.y));

        let step = 0;
        const maxStep = 15;
        const startOX = otherMarble.x;
        const startOY = otherMarble.y;

        const slide = () => {
          step += 1;
          otherMarble.x = startOX + ((targetX - startOX) / maxStep) * step;
          otherMarble.y = startOY + ((targetY - startOY) / maxStep) * step;

          this.render();

          if (step < maxStep) {
            setTimeout(slide, MOVE_DURATION / maxStep);
          } else {
            this.render();
            setTimeout(() => {
              if (this.ordering) {
                this.completeOrderShot();
              } else {
                this.handleDirectJump(marble);
                this.state = "wait_move";
                this.nextTurn();
                this.render();
              }
            }, 150);
          }
        };
        
        slide();
        return true;
      }
    }
    return false;
  }

  private handleDirectJump(marble: Marble) {
    this.nextHole(marble);
  }

  private distanceToHole(marble: Marble, holeId: number) {
    const hole = this.holes[holeId];
    return Math.hypot(marble.x - hole.x, marble.y - hole.y);
  }

  private nextHole(marble: Marble) {
    const currentTarget = marble.hole;
    
    if (!marble.visitedHoles.includes(currentTarget)) {
      marble.visitedHoles.push(currentTarget);
    }

    const targetHole = this.holes[currentTarget];
    marble.inHole = true;
    marble.currentHole = currentTarget;
    marble.x = targetHole.x;
    marble.y = targetHole.y;

    switch (currentTarget) {
      case 0:
        marble.hole = 1;
        break;
      case 1:
        marble.hole = 2;
        break;
      case 2: {
        const unvisitedSideHole = [3, 4].find((holeId) => !marble.visitedHoles.includes(holeId));
        marble.hole = unvisitedSideHole ?? 5;
        break;
      }
      case 3:
      case 4:
        marble.hole = 2;
        break;
      case 5:
        marble.lion = true;
        break;
    }
  }

  render() {
    this.renderFunction({
      activeMarbleId: this.ordering
        ? this.orderCandidates[this.orderIndex] ?? null
        : this.turnOrder[this.turn] ?? null,
      turnOrder: this.turnOrder,
      orderEstablished: this.orderEstablished,
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