import { Scene } from "phaser";
import { System } from "../../system";
import { MOVE_DURATION, MOVE_RANDOM } from "../../constants";

export class Game extends Scene {
  // 브라우저 자동재생 보안을 우회하기 위한 네이티브 사운드 변수
  private nativeHitAudio: HTMLAudioElement | null = null;

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
    // [사운드 시스템] 프로젝트 루트의 assets/hit.mp3를 브라우저 내장 기능을 통해 직접 재생 가능하도록 생성
    try {
      this.nativeHitAudio = new Audio("assets/hit.mp3");
    } catch (e) {
      console.log("Audio load error:", e);
    }

    const marbleImages: Phaser.GameObjects.Image[] = [];
    const holeImages: Phaser.GameObjects.Image[] = [];
    const marbleLabelTexts: Phaser.GameObjects.Text[] = [];
    
    // 자연수 표기를 위한 턴 및 상태 안내 텍스트
    const descriptionText = this.add.text(0, 0, "", {
      color: "#000",
      fontSize: 34,
    });
    
    // 사자 구슬의 누적 득점 현황판 텍스트 (자연수 1~4 매핑)
    const scoreText = this.add.text(280, 0, "", {
      color: "#ff0000",
      fontSize: 30,
      fontStyle: "bold"
    });
    
    const cursorCircle = this.add.circle(-9990, 0, MOVE_RANDOM, 0x0000ff, 0.2).setDepth(-10);
    
    // 레이어 정렬 (Depth 0: 구멍, 50: 사자 후광, 99: 조준선, 100: 구슬, 101: 텍스트 번호)
    const guideGraphics = this.add.graphics().setDepth(99);
    const sunGraphics = this.add.graphics().setDepth(50); 

    let init = false;
    const system = new System(4, (args) => {
      if (!init) {
        init = true;
        
        // 1. 최하단 레이어에 구멍 배치 (Scale 1.5배 조정 반영)
        args.holes.forEach((hole, i) => {
          const holeImg = this.add.image(hole.x, hole.y, "hole");
          holeImg.setScale((25 * 1.5) / 35).setDepth(0); 
          holeImages.push(holeImg);
        });

        // 2. 그 위에 구슬 및 번호 텍스트 정렬
        args.marbles.forEach((marble, i) => {
          marbleImages.push(
            this.add.image(0, 0, marble.lion ? "marble_red" : "marble_green").setDepth(100)
          );
          marbleLabelTexts.push(
            this.add
              .text(0, 0, `${marble.id + 1}`, { // 0,1,2,3 대신 직관적인 자연수 1,2,3,4 표시
                color: "#000",
                fontSize: 39, // 글씨 가독성을 높이기 위해 1포인트 축소 (40 -> 39)
                fontStyle: "bold",
              })
              .setDepth(101) // 숫자가 언제 어디서나 가장 위에 뜨도록 고정
          );
        });
      }

      // 상단 디버그 안내 텍스트 출력 (턴 번호도 1부터 시작되도록 조정)
      descriptionText.setText(`turn: ${args.turn + 1}\nstate: ${args.state}`);

      // 실시간 사자 득점 스코어보드 갱신
      let scoresString = "";
      args.marbles.forEach((marble) => {
        if (marble.lion && marble.kills > 0) {
          scoresString += `${marble.id + 1}번 득점: ${marble.kills}   `; 
        }
      });
      scoreText.setText(scoresString);

      guideGraphics.clear();
      sunGraphics.clear();

      const holeCounters = new Array(args.holes.length).fill(0);

      args.marbles.forEach((marble, i) => {
        const myTurn = i == args.turn;
        
        // 3. 조준 가능한 목표 구멍 강조 및 파란색 '실선' 화살표 연결
        if (myTurn && !marble.lion) {
          const isChoosingFork = marble.hole === 3 && 
                                 !marble.visitedHoles.includes(3) && 
                                 !marble.visitedHoles.includes(4);

          holeImages.forEach((hole, hole_i) => {
            const isTargetHole = isChoosingFork 
              ? (hole_i === 3 || hole_i === 4) 
              : (hole_i === marble.hole);

            hole.setAlpha(isTargetHole ? 0.9 : 0.3);

            if (isChoosingFork) {
              if (hole_i === 3) drawArrowSolidLine(guideGraphics, marble.x, marble.y, hole.x, hole.y);
              if (hole_i === 4) drawArrowSolidLine(guideGraphics, marble.x, marble.y, hole.x, hole.y);
            } else {
              if (hole_i === marble.hole) {
                drawArrowSolidLine(guideGraphics, marble.x, marble.y, hole.x, hole.y);
              }
            }
          });
        } else if (myTurn && marble.lion) {
          // 사자 턴일 때는 가이드라인을 없애고 모든 구멍 투명도 초기화
          holeImages.forEach(hole => hole.setAlpha(0.3));

          // 사자 구슬 밑바닥에 단정하고 자연스럽게 이글거리는 축소형 태양 햇살 효과 그리기
          const rayCount = 12; 
          const innerRadius = 18; 
          const outerRadius = 33; // 45에서 33으로 단축하여 콤팩트한 왕관 연출
          
          sunGraphics.lineStyle(4, 0xffa500, 0.8); 
          for (let r = 0; r < rayCount; r++) {
            const angle = (r * Math.PI * 2) / rayCount;
            const x1 = marble.x + Math.cos(angle) * innerRadius;
            const y1 = marble.y + Math.sin(angle) * innerRadius;
            const x2 = marble.x + Math.cos(angle) * outerRadius;
            const y2 = marble.y + Math.sin(angle) * outerRadius;
            sunGraphics.strokeLineShape(new Phaser.Geom.Line(x1, y1, x2, y2));
          }
          sunGraphics.fillStyle(0xffd700, 0.5); 
          sunGraphics.fillCircle(marble.x, marble.y, innerRadius);
        }

        // 4. 구멍 안에 안착한 구슬들의 동전식 포개기 좌표 산출
        let renderX = marble.x;
        let renderY = marble.y;

        if (marble.inHole && marble.alive && marble.y < 1100) {
          let currentHoleId = 0;
          if (marble.hole === 1) currentHoleId = 0;
          else if (marble.hole === 2) currentHoleId = 1;
          else if (marble.hole === 3) currentHoleId = 2; 
          else if (marble.hole === 4) {
            currentHoleId = marble.visitedHoles.includes(4) ? 2 : 4;
          }
          else if (marble.hole === 5) currentHoleId = 2; 
          
          if (marble.visitedHoles.length > 0) {
            currentHoleId = marble.visitedHoles[marble.visitedHoles.length - 1];
          }
          
          const countInThisHole = holeCounters[currentHoleId];
          holeCounters[currentHoleId] += 1; 

          if (countInThisHole > 0) {
            const holeCoord = args.holes[currentHoleId];
            renderX = holeCoord.x + countInThisHole * 4;
            renderY = holeCoord.y + countInThisHole * 4;
          }
        }

        // 이미지 위치 및 텍스트 최종 스크린 정렬
        const img = marbleImages[i];
        img.setX(renderX);
        img.setY(renderY);
        img.setTexture(marble.lion ? "marble_red" : "marble_green");
        
        const txt = marbleLabelTexts[i];
        txt.setX(renderX - 13);
        txt.setY(renderY - 17);
        txt.setAlpha(myTurn ? 1 : 0.3);

        if (!marble.alive) {
          img.setAlpha(0);
          txt.setAlpha(0);
          return;
        }
      });
    }, 
    () => {
      // 시스템에서 충돌 이벤트를 뱉을 때 오디오 레이턴시 없이 즉시 재생 연타 트리거
      if (this.nativeHitAudio) {
        try {
          this.nativeHitAudio.currentTime = 0; 
          this.nativeHitAudio.play();
        } catch (e) {
          console.log("Audio control error:", e);
        }
      }
    });

    this.add.text(540, 0, system.debugInfo, {
      color: "#000",
      fontSize: 20,
    });

    system.render();

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // 구슬 미끄러짐 도중 마우스 연타 클릭으로 차례가 꼬이는 역주행 버그 완벽 차단
      if (descriptionText.text.includes("state: moving")) {
        return; 
      }

      system.moveMarble(pointer.x, pointer.y);
      cursorCircle.setPosition(pointer.x, pointer.y);
      setTimeout(() => {
        cursorCircle.setPosition(-999, 0);
      }, MOVE_DURATION);
    });
  }
}

// [헬퍼 기능] 구슬 둘레에서 출발하여 구멍 외곽 10px 정면에서 딱 멈추는 선명한 파란색 '실선' 화살표 함수
function drawArrowSolidLine(graphics: Phaser.GameObjects.Graphics, mx: number, my: number, hx: number, hy: number) {
  const marbleRadius = 25 / 2; 
  const holeRadius = (marbleRadius * 1.5) + 10; 

  const angle = Phaser.Math.Angle.Between(mx, my, hx, hy);

  const startX = mx + Math.cos(angle) * marbleRadius;
  const startY = my + Math.sin(angle) * marbleRadius;
  const endX = hx - Math.cos(angle) * holeRadius;
  const endY = hy - Math.sin(angle) * holeRadius;

  graphics.lineStyle(4, 0x0000ff, 0.75); 
  graphics.fillStyle(0x0000ff, 0.75);
  graphics.strokeLineShape(new Phaser.Geom.Line(startX, startY, endX, endY));

  // 화살촉 삼각형 머리 깃 렌더링
  const arrowLength = 14; 
  const arrowAngle = Math.PI / 6; 

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
