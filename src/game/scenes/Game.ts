import { Scene } from "phaser";
import { CLOSE_MARBLE_THRESHOLD, System } from "../../system";
import { MOVE_DURATION, MOVE_RANDOM } from "../../constants";

export class Game extends Scene {
  private hitAudioContext: AudioContext | null = null;

  constructor() {
    super("Game");
  }

  preload() {
    this.load.setPath("assets");
    this.load.image("marble_red", "marble_red.png");
    this.load.image("marble_green", "marble_green.png");
    this.load.image("hole", "hole.png");
    this.load.image("cursor", "cursor.png");
    this.load.image("game-logo", "game-logo.png");
  }

  create() {
    const checkerboard = this.add.graphics().setDepth(-20);
    const tileSize = 50;
    const columns = Math.ceil(this.scale.width / tileSize);
    const rows = Math.ceil(this.scale.height / tileSize);
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const color = (row + column) % 2 === 0 ? 0xfff8e7 : 0xf4e6c8;
        checkerboard.fillStyle(color, 1);
        checkerboard.fillRect(
          column * tileSize,
          row * tileSize,
          tileSize,
          tileSize
        );
      }
    }

    this.add.image(20, 20, "game-logo")
      .setOrigin(0, 0)
      .setDisplaySize(390, 30)
      .setDepth(300);

    const marbleImages: Phaser.GameObjects.Image[] = [];
    const holeImages: Phaser.GameObjects.Image[] = [];
    const marbleLabelTexts: Phaser.GameObjects.Text[] = [];
    const scoreMarbleImages: Phaser.GameObjects.Image[] = [];
    const scoreTexts: Phaser.GameObjects.Text[] = [];
    
    const startButton = this.add.circle(58, 1215, 46, 0x8000a8)
      .setDepth(200)
      .setInteractive({ useHandCursor: true });
    const startButtonText = this.add.text(58, 1215, "시작", {
      color: "#fff",
      fontSize: 24,
      fontStyle: "bold",
    }).setOrigin(0.5).setDepth(201);
    const orderHint = this.add.text(20, 1215, "시작 구멍에 가까운 구슬이 선입니다.", {
      color: "#3d3022",
      fontSize: 22,
      fontStyle: "bold",
      backgroundColor: "#fff8e7",
      padding: { x: 10, y: 6 },
      align: "left",
    }).setOrigin(0, 0.5).setDepth(200).setVisible(false);
    const firstHoleHint = this.add.text(
      20,
      1215,
      "구멍에 넣으면서 전진합니다.\n다른 구슬 맞히면 점프합니다.",
      {
        color: "#3d3022",
        fontSize: 22,
        fontStyle: "bold",
        lineSpacing: 16,
        backgroundColor: "#fff8e7",
        padding: { x: 10, y: 6 },
        align: "left",
      }
    ).setOrigin(0, 0.5).setDepth(200).setVisible(false);
    const lionHint = this.add.text(
      20,
      1215,
      "사자 구슬은 다른 구슬을\n잡을 수 있습니다.",
      {
        color: "#3d3022",
        fontSize: 22,
        fontStyle: "bold",
        lineSpacing: 16,
        backgroundColor: "#fff8e7",
        padding: { x: 10, y: 6 },
        align: "left",
      }
    ).setOrigin(0, 0.5).setDepth(200).setVisible(false);
    const closeMarbleHint = this.add.text(
      -9990,
      0,
      "멀리 보내고 싶은 구슬을 클릭/드래그 하세요",
      {
        color: "#8000a8",
        fontSize: 22,
        fontStyle: "bold",
      }
    ).setOrigin(0.5).setDepth(200).setVisible(false);
    const collisionHighlightGraphics = this.add.graphics().setDepth(98);
    const turnMarkerGraphics = this.add.graphics().setDepth(202);
    
    const cursorCircle = this.add.circle(-9990, 0, MOVE_RANDOM, 0x0000ff, 0.2).setDepth(-10);
    
    // 레이어 정렬 (Depth 0: 구멍, 50: 사자 후광, 99: 조준선, 100: 구슬, 101: 텍스트 번호)
    const guideGraphics = this.add.graphics().setDepth(1000);
    const radarGraphics = this.add.graphics().setDepth(1000);
    const dragAimGraphics = this.add.graphics().setDepth(102);
    let closeMarbles: { id: number; x: number; y: number }[] = [];
    let canMove = false;
    let orderingShot = false;
    let lionTurn = false;
    let highlightedTurnMarbleId: number | null = null;
    let lionPulseTween: Phaser.Tweens.Tween | null = null;
    let radarTween: Phaser.Tweens.Tween | null = null;
    const radarRotation = { angle: 0 };
    let radarMarbleId: number | null = null;
    let dragStart: { x: number; y: number } | null = null;
    let selectedCloseMarbleId: number | null = null;
    let firstHoleHintActive = false;
    let firstHoleTurnChanges = 0;
    let lastFirstHoleHintMarbleId: number | null = null;
    let lionHintActive = false;
    let lionHintTurnChanges = 0;
    let lastLionHintMarbleId: number | null = null;

    let init = false;
    const system = new System(4, (args) => {
      canMove = args.state === "wait_move" || args.state === "wait_order_move";
      orderingShot = args.state === "wait_order_move";
      const activeMarble = args.marbles.find((marble) => marble.id === args.activeMarbleId);
      lionTurn = activeMarble?.lion ?? false;
      if (!init) {
        init = true;
        
        // 1. 최하단 레이어에 구멍 배치 (Scale 1.5배 조정 반영)
        args.holes.forEach((hole) => {
          const holeImg = this.add.image(hole.x, hole.y, "hole");
          holeImg.setScale((25 * 1.5) / 35).setAlpha(0).setDepth(0);
          holeImages.push(holeImg);
        });
        const holeMarkers = this.add.graphics().setDepth(2);
        holeMarkers.lineStyle(3, 0x555555, 1);
        args.holes.forEach((hole) => holeMarkers.strokeCircle(hole.x, hole.y, 20));

        // 2. 그 위에 구슬 및 번호 텍스트 정렬
        args.marbles.forEach((marble, i) => {
          marbleImages.push(
            this.add.image(0, 0, marble.lion ? "marble_red" : "marble_green").setDepth(100)
          );
          marbleLabelTexts.push(
            this.add
              .text(0, 0, `${marble.id + 1}`, { // 0,1,2,3 대신 직관적인 자연수 1,2,3,4 표시
                color: "#000",
                fontSize: 22,
                fontStyle: "bold",
              })
              .setOrigin(0.5)
              .setDepth(101) // 숫자가 언제 어디서나 가장 위에 뜨도록 고정
          );
          scoreMarbleImages.push(
            this.add.image(455, 1110 + i * 35, "marble_green")
              .setDisplaySize(20, 20)
              .setDepth(200)
          );
          scoreTexts.push(
            this.add.text(475, 1110 + i * 35, `${marble.id + 1}번 득점: 0`, {
              color: "#ff0000",
              fontSize: 18,
              fontStyle: "bold",
            }).setOrigin(0, 0.5).setDepth(200)
          );
        });
      }

      startButton.setVisible(args.state === "ready");
      startButtonText.setVisible(args.state === "ready");
      startButtonText.setText("시작").setFontSize(24);
      orderHint.setVisible(
        !args.orderEstablished &&
        args.state !== "ready" &&
        args.state !== "revealing_order"
      );
      if (args.orderEstablished && args.state === "wait_move") {
        if (lastFirstHoleHintMarbleId === null) {
          firstHoleHintActive = true;
          lastFirstHoleHintMarbleId = args.activeMarbleId;
        } else if (args.activeMarbleId !== lastFirstHoleHintMarbleId) {
          firstHoleTurnChanges += 1;
          lastFirstHoleHintMarbleId = args.activeMarbleId;
          if (firstHoleTurnChanges >= 4) {
            firstHoleHintActive = false;
          }
        }
      }
      firstHoleHint.setVisible(firstHoleHintActive);
      if (
        args.orderEstablished &&
        !lionHintActive &&
        args.marbles.some((marble) => marble.lion)
      ) {
        lionHintActive = true;
        lastLionHintMarbleId = args.activeMarbleId;
      }
      if (lionHintActive && args.state === "wait_move") {
        if (lastLionHintMarbleId === null) {
          lastLionHintMarbleId = args.activeMarbleId;
        } else if (args.activeMarbleId !== lastLionHintMarbleId) {
          lionHintTurnChanges += 1;
          lastLionHintMarbleId = args.activeMarbleId;
          if (lionHintTurnChanges >= 4) {
            lionHintActive = false;
          }
        }
      }
      lionHint.setVisible(lionHintActive);
      firstHoleHint.setVisible(firstHoleHintActive && !lionHintActive);

      // 실시간 구슬별 득점 현황 갱신
      args.marbles.forEach((marble, i) => {
        const listY = 1110 + args.turnOrder.indexOf(marble.id) * 35;
        scoreMarbleImages[i]
          .setPosition(455, listY)
          .setTexture(marble.lion ? "marble_red" : "marble_green")
          .setVisible(!marble.deployed && marble.alive);
        scoreTexts[i].setPosition(475, listY);
        scoreTexts[i].setText(`${marble.id + 1}번 득점: ${marble.kills}`);
      });

      turnMarkerGraphics.clear();
      const activeTurnOrderIndex = args.activeMarbleId === null
        ? -1
        : args.turnOrder.indexOf(args.activeMarbleId);
      const selectingTurnOrder =
        !args.orderEstablished &&
        args.state !== "ready" &&
        args.state !== "revealing_order";
      if (
        (args.orderEstablished && args.state !== "ready" || selectingTurnOrder) &&
        activeTurnOrderIndex >= 0
      ) {
        turnMarkerGraphics.lineStyle(3, 0x8000a8, 1);
        turnMarkerGraphics.strokeCircle(493, 1110 + activeTurnOrderIndex * 35, 20);
      }

      const activeTurnMarble = args.orderEstablished &&
        args.state !== "ready" &&
        activeMarble?.alive
        ? activeMarble
        : null;
      const activeRadarMarble = args.state === "wait_move" &&
        activeMarble?.alive &&
        activeMarble.deployed &&
        activeMarble.lion
        ? activeMarble
        : null;
      const activeRadarMarbleId = activeRadarMarble?.id ?? null;
      if (activeRadarMarbleId !== radarMarbleId) {
        radarTween?.stop();
        radarTween = null;
        radarGraphics.clear();
        radarMarbleId = activeRadarMarbleId;
        if (activeRadarMarble) {
          radarRotation.angle = 0;
          radarTween = this.tweens.add({
            targets: radarRotation,
            angle: Math.PI * 2,
            duration: 6000,
            ease: "Linear",
            repeat: -1,
            onUpdate: () => {
              radarGraphics.clear();
              drawRadarArrow(
                radarGraphics,
                activeRadarMarble.x,
                activeRadarMarble.y,
                radarRotation.angle
              );
            },
          });
        }
      }
      if (activeTurnMarble?.id !== highlightedTurnMarbleId) {
        lionPulseTween?.stop();
        if (highlightedTurnMarbleId !== null) {
          marbleImages[highlightedTurnMarbleId]?.setAlpha(1);
        }
        highlightedTurnMarbleId = activeTurnMarble?.id ?? null;
        lionPulseTween = activeTurnMarble
          ? this.tweens.add({
              targets: marbleImages[activeTurnMarble.id],
              alpha: { from: 0.35, to: 1 },
              duration: 450,
              ease: "Sine.easeInOut",
              yoyo: true,
              repeat: -1,
            })
          : null;
      }

      guideGraphics.clear();
      collisionHighlightGraphics.clear();
      closeMarbleHint.setVisible(false);
      closeMarbles = [];

      if (args.state === "wait_move") {
        if (activeMarble?.deployed && activeMarble.alive) {
          closeMarbles = args.marbles.filter((other) => {
            if (
              other.id === activeMarble.id ||
              !other.alive ||
              !other.deployed ||
              other.inHole
            ) {
              return false;
            }
            return Phaser.Math.Distance.Between(
              activeMarble.x,
              activeMarble.y,
              other.x,
              other.y
            ) <= CLOSE_MARBLE_THRESHOLD;
          });

          if (closeMarbles.length > 0) {
            collisionHighlightGraphics.lineStyle(3, 0xffcc00, 0.95);
            closeMarbles.forEach((marble) => {
              const targetX = marble.x - activeMarble.x;
              const targetY = marble.y - activeMarble.y;
              const pairDistance = Math.hypot(targetX, targetY);
              const targetAngle = Math.atan2(targetY, targetX);
              const marbleRadius = 12.5;
              const outerPadding = 10;
              const centerShift = outerPadding / 2;
              const centerOffset = pairDistance / 2 + centerShift;
              const targetOffset = pairDistance - centerOffset;
              const majorRadius = centerOffset + marbleRadius;
              const minorRadius = (marbleRadius + outerPadding) /
                Math.sqrt(1 - (targetOffset / majorRadius) ** 2);
              const ellipseCenterX =
                activeMarble.x + Math.cos(targetAngle) * centerOffset;
              const ellipseCenterY =
                activeMarble.y + Math.sin(targetAngle) * centerOffset;
              const ellipsePoints = Array.from({ length: 33 }, (_, index) => {
                const angle = (index / 32) * Math.PI * 2;
                const localX = Math.cos(angle) * majorRadius;
                const localY = Math.sin(angle) * minorRadius;
                return new Phaser.Math.Vector2(
                  ellipseCenterX + localX * Math.cos(targetAngle) - localY * Math.sin(targetAngle),
                  ellipseCenterY + localX * Math.sin(targetAngle) + localY * Math.cos(targetAngle)
                );
              });
              collisionHighlightGraphics.strokePoints(ellipsePoints, true);
            });
            if (!lionTurn) {
              closeMarbleHint
                .setText("근접 구슬을 클릭하거나,\n클릭&드래그로 멀리 보낼 수 있어요")
                .setPosition(activeMarble.x, activeMarble.y - 45)
                .setVisible(true);
            }
          }
        }
      }

      const holeStackPositions = new Map<number, { offset: number; depth: number }>();
      args.holes.forEach((hole) => {
        const stack = args.marbles
          .filter((marble) =>
            marble.alive &&
            marble.deployed &&
            (
              marble.inHole && marble.currentHole === hole.id ||
              marble.id === args.activeMarbleId &&
              Phaser.Math.Distance.Between(marble.x, marble.y, hole.x, hole.y) <= 20
            )
          )
          .sort((a, b) => {
            if (a.id === args.activeMarbleId) return -1;
            if (b.id === args.activeMarbleId) return 1;
            const aOrderIndex = args.turnOrder.indexOf(a.id);
            const bOrderIndex = args.turnOrder.indexOf(b.id);
            return aOrderIndex - bOrderIndex;
          });

        stack.forEach((marble, index) => {
          holeStackPositions.set(marble.id, {
            offset: index * 4,
            depth: 100 + (stack.length - index) * 2,
          });
        });
      });

      args.marbles.forEach((marble, i) => {
        const myTurn = marble.id === args.activeMarbleId;
        
        // 3. 조준 가능한 목표 구멍 강조 및 파란색 '실선' 화살표 연결
        if (args.state === "wait_move" && marble.deployed && myTurn && !marble.lion) {
          const isChoosingFork = marble.hole === 3 && 
                                 !marble.visitedHoles.includes(3) && 
                                 !marble.visitedHoles.includes(4);

          holeImages.forEach((hole, hole_i) => {
            if (isChoosingFork) {
              if (hole_i === 3) drawArrowSolidLine(guideGraphics, marble.x, marble.y, hole.x, hole.y);
              if (hole_i === 4) drawArrowSolidLine(guideGraphics, marble.x, marble.y, hole.x, hole.y);
            } else {
              if (hole_i === marble.hole) {
                drawArrowSolidLine(guideGraphics, marble.x, marble.y, hole.x, hole.y);
              }
            }
          });
        }

        // 4. 구멍 안에 안착한 구슬들의 동전식 포개기 좌표 산출
        let renderX = marble.x;
        let renderY = marble.y;

        const stackPosition = holeStackPositions.get(marble.id);
        if (stackPosition && marble.currentHole !== null) {
          const holeCoord = args.holes[marble.currentHole];
          renderX = holeCoord.x + stackPosition.offset;
          renderY = holeCoord.y + stackPosition.offset;
        }

        // 이미지 위치 및 텍스트 최종 스크린 정렬
        const img = marbleImages[i];
        if (!marble.alive || !marble.deployed) {
          img.setAlpha(0);
          marbleLabelTexts[i].setAlpha(0);
          return;
        }

        const turnOrderIndex = args.turnOrder.indexOf(marble.id);
        const marbleDepth = marble.id === args.activeMarbleId
          ? 150
          : stackPosition?.depth ?? 100 + args.turnOrder.length - turnOrderIndex;
        img.setX(renderX);
        img.setY(renderY);
        img.setDepth(marbleDepth);
        img.setAlpha(marble.id === highlightedTurnMarbleId ? img.alpha : 1);
        img.setTexture(marble.lion ? "marble_red" : "marble_green");
        
        const txt = marbleLabelTexts[i];
        txt.setPosition(renderX, renderY);
        txt.setDepth(marbleDepth + 1);
        txt.setColor("#000000");
        txt.setAlpha(1);
      });
    }, 
    () => {
      const context = this.hitAudioContext;
      if (!context || context.state !== "running") {
        console.error("Collision sound is unavailable because the audio context is not running.");
        return;
      }

      const now = context.currentTime;
      const partials = [
        { frequency: 1320, volume: 0.12 },
        { frequency: 1980, volume: 0.055 },
        { frequency: 2640, volume: 0.02 },
      ];

      partials.forEach(({ frequency, volume }) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, now);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.985, now + 0.32);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(volume, now + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.4);
      });
    },
    (distance: number) => {
      const context = this.hitAudioContext;
      if (!context || context.state !== "running" || distance <= 0) {
        return;
      }

      const duration = Phaser.Math.Clamp(distance / 700, 0.16, 0.7);
      const now = context.currentTime;
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i += 1) {
        samples[i] = Math.random() * 2 - 1;
      }

      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      const oscillator = context.createOscillator();
      const toneGain = context.createGain();
      source.buffer = buffer;
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(2200, now);
      filter.frequency.exponentialRampToValueAtTime(1100, now + duration);
      filter.Q.setValueAtTime(0.7, now);
      const volume = Phaser.Math.Clamp(0.035 + distance / 12000, 0.035, 0.055);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(1250, now);
      oscillator.frequency.exponentialRampToValueAtTime(850, now + duration);
      toneGain.gain.setValueAtTime(0.0001, now);
      toneGain.gain.linearRampToValueAtTime(0.018, now + 0.02);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(toneGain);
      toneGain.connect(context.destination);
      source.start(now);
      oscillator.start(now);
      oscillator.stop(now + duration);
    });

    system.render();

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!canMove) {
        dragStart = null;
        selectedCloseMarbleId = null;
        return;
      }

      selectedCloseMarbleId = closeMarbles
        .filter((marble) =>
          !orderingShot &&
          Phaser.Math.Distance.Between(pointer.x, pointer.y, marble.x, marble.y) <= 26
        )
        .sort((a, b) =>
          Phaser.Math.Distance.Between(pointer.x, pointer.y, a.x, a.y) -
          Phaser.Math.Distance.Between(pointer.x, pointer.y, b.x, b.y)
        )[0]?.id ?? null;
      dragStart = { x: pointer.x, y: pointer.y };
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (!dragStart || selectedCloseMarbleId === null || !pointer.isDown) {
        return;
      }

      dragAimGraphics.clear();
      dragAimGraphics.lineStyle(3, 0x0000ff, 0.8);
      dragAimGraphics.strokeLineShape(
        new Phaser.Geom.Line(dragStart.x, dragStart.y, pointer.x, pointer.y)
      );
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!canMove || !dragStart) {
        dragStart = null;
        selectedCloseMarbleId = null;
        dragAimGraphics.clear();
        return;
      }

      const targetMarbleId = selectedCloseMarbleId;
      const directionX = pointer.x - dragStart.x;
      const directionY = pointer.y - dragStart.y;
      dragStart = null;
      selectedCloseMarbleId = null;
      dragAimGraphics.clear();

      if (targetMarbleId !== null) {
        if (!lionTurn && Math.hypot(directionX, directionY) < 5) {
          system.moveMarble(pointer.x, pointer.y);
        } else {
          system.moveMarble(directionX, directionY, targetMarbleId);
        }
      } else {
        system.moveMarble(pointer.x, pointer.y);
      }

      cursorCircle.setPosition(pointer.x, pointer.y);
      setTimeout(() => {
        cursorCircle.setPosition(-999, 0);
      }, MOVE_DURATION);
    });

    startButton.on("pointerdown", (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.enableHitAudio();
      if (system.hasOrderEstablished) {
        system.startGame();
      } else {
        system.startOrderSelection();
      }
    });
  }

  private enableHitAudio() {
    try {
      this.hitAudioContext ??= new AudioContext();
      if (this.hitAudioContext.state === "suspended") {
        void this.hitAudioContext.resume().catch((error: unknown) => {
          console.error("Could not enable collision sound:", error);
        });
      }
    } catch (error) {
      console.error("Could not initialize collision sound:", error);
    }
  }
}

// 구슬 둘레에서 출발해 구멍 중심을 지나 40px 더 나아가는 얇은 파란 점선 화살표
function drawArrowSolidLine(graphics: Phaser.GameObjects.Graphics, mx: number, my: number, hx: number, hy: number) {
  const marbleRadius = 25 / 2; 

  const angle = Phaser.Math.Angle.Between(mx, my, hx, hy);

  const startX = mx + Math.cos(angle) * marbleRadius;
  const startY = my + Math.sin(angle) * marbleRadius;
  const endX = hx + Math.cos(angle) * 60;
  const endY = hy + Math.sin(angle) * 60;

  graphics.lineStyle(2, 0x0000ff, 0.75);
  graphics.fillStyle(0x0000ff, 0.75);
  const lineLength = Phaser.Math.Distance.Between(startX, startY, endX, endY);
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const dashLength = 8;
  const dashGap = 6;

  for (let distance = 0; distance < lineLength; distance += dashLength + dashGap) {
    const dashEnd = Math.min(distance + dashLength, lineLength);
    graphics.strokeLineShape(
      new Phaser.Geom.Line(
        startX + directionX * distance,
        startY + directionY * distance,
        startX + directionX * dashEnd,
        startY + directionY * dashEnd
      )
    );
  }

  // 화살촉 삼각형 머리 깃 렌더링
  const arrowLength = 12;
  const arrowAngle = Math.PI / 7;

  const leftWingX = endX - arrowLength * Math.cos(angle - arrowAngle);
  const leftWingY = endY - arrowLength * Math.sin(angle - arrowAngle);
  const rightWingX = endX - arrowLength * Math.cos(angle + arrowAngle);
  const rightWingY = endY - arrowLength * Math.sin(angle + arrowAngle);

  graphics.beginPath();
  graphics.moveTo(endX, endY);
  graphics.lineTo(leftWingX, leftWingY);
  graphics.lineTo(rightWingX, rightWingY);
  graphics.closePath();
  graphics.fillPath();
}

function drawRadarArrow(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  angle: number
) {
  const startDistance = 16;
  const endDistance = 88;
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const startX = x + directionX * startDistance;
  const startY = y + directionY * startDistance;
  const endX = x + directionX * endDistance;
  const endY = y + directionY * endDistance;
  const dashLength = 8;
  const dashGap = 6;

  graphics.lineStyle(2, 0x0000ff, 0.75);
  graphics.fillStyle(0x0000ff, 0.75);
  for (let distance = 0; distance < endDistance - startDistance; distance += dashLength + dashGap) {
    const dashEnd = Math.min(distance + dashLength, endDistance - startDistance);
    graphics.strokeLineShape(
      new Phaser.Geom.Line(
        startX + directionX * distance,
        startY + directionY * distance,
        startX + directionX * dashEnd,
        startY + directionY * dashEnd
      )
    );
  }

  const arrowLength = 12;
  const arrowAngle = Math.PI / 7;
  graphics.beginPath();
  graphics.moveTo(endX, endY);
  graphics.lineTo(
    endX - arrowLength * Math.cos(angle - arrowAngle),
    endY - arrowLength * Math.sin(angle - arrowAngle)
  );
  graphics.lineTo(
    endX - arrowLength * Math.cos(angle + arrowAngle),
    endY - arrowLength * Math.sin(angle + arrowAngle)
  );
  graphics.closePath();
  graphics.fillPath();
}
