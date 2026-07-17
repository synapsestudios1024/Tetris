/* ==========================================================================
   Retro Neon Tetris - Controls Handler (Keyboard DAS/ARR & Mobile Gestures)
   ========================================================================== */

class ControlsHandler {
    constructor(game) {
        this.game = game;

        // DAS & ARR 파라미터 (ms 단위)
        this.DAS_DELAY = 170; // Delayed Auto Shift
        this.ARR_RATE = 30;   // Auto Repeat Rate

        // 조작 키 바인딩 맵
        this.keys = {
            ArrowLeft: { pressed: false, time: 0, das: false, lastRepeat: 0 },
            ArrowRight: { pressed: false, time: 0, das: false, lastRepeat: 0 },
            ArrowDown: { pressed: false },
            ArrowUp: { pressed: false },
            KeyZ: { pressed: false },
            Space: { pressed: false },
            ShiftLeft: { pressed: false },
            KeyP: { pressed: false }
        };

        // 모바일 스와이프 제스처 관련 변수
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchStartTime = 0;
        
        // 스와이프 민감도 임계값 (px 단위)
        this.swipeThresholdX = 28; 
        this.swipeThresholdY = 24; 

        this.initKeyboard();
        this.initTouch();
    }

    // 1. 키보드 이벤트 리스너 설정
    initKeyboard() {
        window.addEventListener('keydown', (e) => {
            // 게임 중 포커스 소실 시 브라우저 기본 스크롤 방지
            const preventKeys = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft'];
            if (preventKeys.includes(e.code) && !this.game.isGameOver) {
                e.preventDefault();
            }

            if (this.game.isGameOver || this.game.isPaused) {
                // 일시 정지 상태에서 P/Resume 키 조작 허용
                if (e.code === 'KeyP' && !this.game.isGameOver) {
                    this.game.togglePause();
                }
                return;
            }

            const now = performance.now();

            switch (e.code) {
                case 'ArrowLeft':
                    if (!this.keys.ArrowLeft.pressed) {
                        this.keys.ArrowLeft.pressed = true;
                        this.keys.ArrowLeft.time = now;
                        this.keys.ArrowLeft.das = false;
                        this.game.moveLeft();
                    }
                    break;
                case 'ArrowRight':
                    if (!this.keys.ArrowRight.pressed) {
                        this.keys.ArrowRight.pressed = true;
                        this.keys.ArrowRight.time = now;
                        this.keys.ArrowRight.das = false;
                        this.game.moveRight();
                    }
                    break;
                case 'ArrowDown':
                    this.keys.ArrowDown.pressed = true;
                    break;
                case 'ArrowUp':
                    this.game.rotateCW();
                    break;
                case 'KeyZ':
                    this.game.rotateCCW();
                    break;
                case 'Space':
                    this.game.hardDrop();
                    break;
                case 'ShiftLeft':
                case 'ShiftRight':
                    this.game.holdPiece();
                    break;
                case 'KeyP':
                    this.game.togglePause();
                    break;
            }
        });

        window.addEventListener('keyup', (e) => {
            switch (e.code) {
                case 'ArrowLeft':
                    this.keys.ArrowLeft.pressed = false;
                    break;
                case 'ArrowRight':
                    this.keys.ArrowRight.pressed = false;
                    break;
                case 'ArrowDown':
                    this.keys.ArrowDown.pressed = false;
                    break;
            }
        });
    }

    // 2. 키보드 실시간 업데이트 (DAS / ARR 가속 처리)
    update(now) {
        if (this.game.isPaused || this.game.isGameOver) return;

        // 왼쪽 이동 가속 (DAS)
        if (this.keys.ArrowLeft.pressed) {
            const elapsed = now - this.keys.ArrowLeft.time;
            if (!this.keys.ArrowLeft.das) {
                if (elapsed >= this.DAS_DELAY) {
                    this.keys.ArrowLeft.das = true;
                    this.keys.ArrowLeft.lastRepeat = now;
                    this.game.moveLeft();
                }
            } else {
                const repeatElapsed = now - this.keys.ArrowLeft.lastRepeat;
                const steps = Math.floor(repeatElapsed / this.ARR_RATE);
                if (steps > 0) {
                    for (let i = 0; i < steps; i++) {
                        this.game.moveLeft();
                    }
                    this.keys.ArrowLeft.lastRepeat += steps * this.ARR_RATE;
                }
            }
        }

        // 오른쪽 이동 가속 (DAS)
        if (this.keys.ArrowRight.pressed) {
            const elapsed = now - this.keys.ArrowRight.time;
            if (!this.keys.ArrowRight.das) {
                if (elapsed >= this.DAS_DELAY) {
                    this.keys.ArrowRight.das = true;
                    this.keys.ArrowRight.lastRepeat = now;
                    this.game.moveRight();
                }
            } else {
                const repeatElapsed = now - this.keys.ArrowRight.lastRepeat;
                const steps = Math.floor(repeatElapsed / this.ARR_RATE);
                if (steps > 0) {
                    for (let i = 0; i < steps; i++) {
                        this.game.moveRight();
                    }
                    this.keys.ArrowRight.lastRepeat += steps * this.ARR_RATE;
                }
            }
        }

        // 소프트 드롭 실시간 감지
        if (this.keys.ArrowDown.pressed) {
            this.game.softDrop();
        }
    }

    // 3. 모바일 터치 제스처 리스너 설정
    initTouch() {
        const boardCanvas = document.getElementById('canvas-board');
        if (!boardCanvas) return;

        // 모바일 화면 터치 시 스크롤 / 더블탭 확대 줌 방지
        const preventDefaultTouch = (e) => {
            if (!this.game.isGameOver) {
                e.preventDefault();
            }
        };

        boardCanvas.addEventListener('touchstart', (e) => {
            preventDefaultTouch(e);
            
            if (this.game.isPaused || this.game.isGameOver) return;

            const touch = e.touches[0];
            this.touchStartX = touch.clientX;
            this.touchStartY = touch.clientY;
            this.touchStartTime = performance.now();
        }, { passive: false });

        boardCanvas.addEventListener('touchmove', (e) => {
            preventDefaultTouch(e);

            if (this.game.isPaused || this.game.isGameOver) return;

            const touch = e.touches[0];
            const dx = touch.clientX - this.touchStartX;
            const dy = touch.clientY - this.touchStartY;

            // 가로 스와이프 (이동)
            if (Math.abs(dx) >= this.swipeThresholdX) {
                if (dx > 0) {
                    this.game.moveRight();
                } else {
                    this.game.moveLeft();
                }
                // 터치 기점 재설정을 통해 연속적인 스와이프 이동 실현
                this.touchStartX = touch.clientX;
                this.touchStartY = touch.clientY;
            } 
            // 세로 스와이프 (소프트 드롭)
            else if (dy >= this.swipeThresholdY) {
                this.game.softDrop();
                this.touchStartY = touch.clientY; // 연속 드롭
            }
        }, { passive: false });

        boardCanvas.addEventListener('touchend', (e) => {
            preventDefaultTouch(e);

            if (this.game.isPaused || this.game.isGameOver) return;

            const touch = e.changedTouches[0];
            const dx = touch.clientX - this.touchStartX;
            const dy = touch.clientY - this.touchStartY;
            const duration = performance.now() - this.touchStartTime;

            // 탭 연산 (이동 거리가 작고 속도가 빠름) - 시계 방향 회전만 처리
            if (Math.abs(dx) < 15 && Math.abs(dy) < 15 && duration < 250) {
                this.game.rotateCW();
            } 
            // 빠른 아래 방향 스와이프 (하드 드롭 검사)
            else if (dy > 80 && duration < 220) {
                this.game.hardDrop();
            }
        }, { passive: false });

        // 모바일 보조 버튼 연동
        const btnHold = document.getElementById('btn-mobile-hold');
        const btnHardDrop = document.getElementById('btn-mobile-hard-drop');

        if (btnHold) {
            btnHold.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.game.holdPiece();
            });
        }

        if (btnHardDrop) {
            btnHardDrop.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.game.hardDrop();
            });
        }
    }

    // 초기 상태 리셋
    reset() {
        for (const key in this.keys) {
            this.keys[key].pressed = false;
            if (this.keys[key].time !== undefined) {
                this.keys[key].time = 0;
                this.keys[key].das = false;
                this.keys[key].lastRepeat = 0;
            }
        }
    }
}
