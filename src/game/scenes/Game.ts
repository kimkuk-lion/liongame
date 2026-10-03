import { Scene } from "phaser";
import { System } from "../../system";
import { MOVE_DURATION, MOVE_RANDOM } from "../../constants";

export class Game extends Scene {
  constructor() {
    super("Game");
  }

  preload() {
    this.load.setPath("assets");
    this.load.image("marble_red", "marble_red.png");
    this.load.image("marble_green", "marble_green.png");
    this.load.image("hole", "hole.png");
    this.load.image("cursor", "cursor.png");
  }

  create() {
    const marbleImages: Phaser.GameObjects.Image[] = [];
    const holeImages: Phaser.GameObjects.Image[] = [];
    const marbleLabelTexts: Phaser.GameObjects.Text[] = [];
    const descriptionText = this.add.text(0, 0, "", {
      color: "#000",
      fontSize: 34,
    });
    const guideLine = this.add.line(0, 0, 0, 0, 0, 0, 0xff0000, 0.3);
    guideLine.setDepth(99).setLineWidth(20, 1);
    const cursorCircle = this.add.circle(-9990, 0, MOVE_RANDOM, 0x0000ff, 0.2).setDepth(-10);

    let init = false;
    const system = new System(4, (args) => {
      if (!init) {
        init = true;
        args.marbles.forEach((marble, i) => {
          marbleImages.push(
            this.add.image(0, 0, marble.lion ? "marble_red" : "marble_green").setDepth(1)
          );
          marbleLabelTexts.push(
            this.add
              .text(0, 0, "asdjflkasdjfl", {
                color: "#000",
                fontSize: 40,
                fontStyle: "bold",
              })
              .setDepth(2)
          );
        });

        args.holes.forEach((hole, i) => {
          holeImages.push(this.add.image(hole.x, hole.y, "hole"));
        });
      }

      descriptionText.setText(`turn: ${args.turn}\nstate: ${args.state}`);

      args.marbles.forEach((marble, i) => {
        const myTurn = i == args.turn;
        if (myTurn) {
          holeImages.forEach((hole, hole_i) => {
            const targetHole = hole_i == marble.hole;
            hole.setAlpha(targetHole ? 0.9 : 0.3);
            if (targetHole) {
              guideLine.setTo(marble.x, marble.y, hole.x, hole.y);
            }
          });
        }
        const img = marbleImages[i];
        img.setX(marble.x);
        img.setY(marble.y);
        img.setTexture(marble.lion ? "marble_red" : "marble_green");
        const txt = marbleLabelTexts[i];
        txt.setX(marble.x - 13);
        txt.setY(marble.y - 17);
        txt.setText(`${marble.id}`);
        txt.setAlpha(myTurn ? 1 : 0.3);

        if (!marble.lion) {
        }

        if (!marble.alive) {
          img.setAlpha(0);
          txt.setAlpha(0);
          return;
        }
      });
    });
    this.add.text(450, 0, system.debugInfo, {
      color: "#000",
      fontSize: 20,
    });

    system.render();

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      system.moveMarble(pointer.x, pointer.y);
      cursorCircle.setPosition(pointer.x, pointer.y);
      setTimeout(() => {
        cursorCircle.setPosition(-999, 0);
      }, MOVE_DURATION);
    });
  }
}
