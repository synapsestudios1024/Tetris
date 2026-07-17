/* ==========================================================================
   Retro Neon Tetris - Main Orchestrator & Game Engine
   ========================================================================== */

class TetrisGame {
    constructor() {
        // 하위 모듈 인스턴스화
        this.board = new TetrisBoard();
        this.queue = new GameQueue();
        this.controls = new ControlsHandler(this);

        // 게임 상태 플래그
        this.hasStarted = false;
        this.isPaused = false;
        this.isGameOver = false;

        // 게임 룰 데이터
        this.score = 0;
        this.highScore = 0;
        this.level = 1;
        this.lines = 0;
        this.timer = 0; // 초 단위

        // 난이도 및 틱 타임 테이블 (ms)
        this.gravitySpeeds = {
            1: 1000, 2: 820, 3: 670, 4: 530, 5: 400,
            6: 300,  7: 220, 8: 150, 9: 100, 10: 70,
            11: 50,  12: 40,  13: 30,  14: 22,  15: 15
        };

        // 현 세션 조작 중인 피스
        this.currentPiece = null;

        // 통계용 소환 카운터
        this.pieceStats = { I: 0, O: 0, T: 0, S: 0, Z: 0, J: 0, L: 0 };

        // 프레임 제어용 타임스탬프
        this.lastTime = 0;
        this.dropCounter = 0;
        this.timerCounter = 0; // 1초 누적기

        // 락 딜레이 (Lock Delay) 관련 변수
        this.lockDelayLimit = 500; // ms 단위 고정 대기 시간
        this.lockDelayCounter = 0;
        this.isLocking = false;
        this.lockResets = 0;
        this.maxLockResets = 15; // 무한 회전 방지 임계값

        // 연속 보너스 판정
        this.lastClearWasDifficult = false; // Tetris 혹은 T-Spin 여부
        this.comboCount = -1; // -1 = 콤보 없음, 0 = 1차 콤보 시작 등

        // 설정 값 로드
        this.settings = {
            ghostPiece: true,
            grid: true,
            startLevel: 1
        };

        this.init();
    }

    // 1. 초기 셋업 및 UI 이벤트 바인딩
    init() {
        this.loadHighScore();
        this.setupUIEvents();
        this.loadSettingsFromUI();

        // 첫 프레임 루프 가동
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    loadHighScore() {
        const saved = localStorage.getItem('tetris_high_score');
        if (saved) {
            this.highScore = parseInt(saved, 10);
            this.updateUI();
        }
    }

    saveHighScore() {
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('tetris_high_score', this.highScore.toString());
            this.updateUI();
        }
    }

    setupUIEvents() {
        // 시작 버튼
        document.getElementById('btn-start-game').addEventListener('click', () => {
            this.start();
        });

        // 메인 하단 버튼
        document.getElementById('btn-pause').addEventListener('click', () => {
            this.togglePause();
        });
        document.getElementById('btn-restart').addEventListener('click', () => {
            this.restart();
        });

        // 오버레이 및 모달 내부 버튼
        document.getElementById('btn-restart-over').addEventListener('click', () => {
            this.restart();
        });
        document.getElementById('btn-resume').addEventListener('click', () => {
            this.togglePause();
        });

        // 오디오 토글
        document.getElementById('btn-audio-toggle').addEventListener('click', () => {
            const isMuted = AudioSynth.toggleMute();
            document.getElementById('btn-audio-toggle').innerHTML = isMuted ? '🔇' : '🔊';
        });

        // 설정 모달 토글
        const modal = document.getElementById('settings-modal');
        document.getElementById('btn-settings-toggle').addEventListener('click', () => {
            modal.classList.remove('hidden');
            if (this.hasStarted && !this.isPaused && !this.isGameOver) {
                this.togglePause();
            }
        });
        document.getElementById('btn-settings-close').addEventListener('click', () => {
            modal.classList.add('hidden');
            this.applySettingsFromUI();
        });

        // 최고 점수 초기화
        document.getElementById('btn-reset-highscore').addEventListener('click', () => {
            if (confirm('최고 점수를 초기화하시겠습니까?')) {
                localStorage.removeItem('tetris_high_score');
                this.highScore = 0;
                this.updateUI();
                alert('최고 점수가 초기화되었습니다.');
            }
        });

        // 설정 볼륨 슬라이더 반응 연동
        const musicVolume = document.getElementById('slider-music-volume');
        const musicLabel = document.getElementById('label-music-volume');
        musicVolume.addEventListener('input', (e) => {
            const val = e.target.value;
            musicLabel.textContent = `${val}%`;
            AudioSynth.setMusicVolume(val);
        });

        const sfxVolume = document.getElementById('slider-sfx-volume');
        const sfxLabel = document.getElementById('label-sfx-volume');
        sfxVolume.addEventListener('input', (e) => {
            const val = e.target.value;
            sfxLabel.textContent = `${val}%`;
            AudioSynth.setSfxVolume(val);
        });

        // 브라우저 탭 비활성화 시 자동 일시 정지 처리
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.hasStarted && !this.isPaused && !this.isGameOver) {
                this.togglePause();
            }
        });
    }

    loadSettingsFromUI() {
        this.settings.ghostPiece = document.getElementById('chk-ghost-piece').checked;
        this.settings.grid = document.getElementById('chk-grid').checked;
        this.settings.startLevel = parseInt(document.getElementById('select-start-level').value, 10);
    }

    applySettingsFromUI() {
        this.loadSettingsFromUI();
        // 난이도 미시작 상태에서 레벨에 반영
        if (!this.hasStarted) {
            this.level = this.settings.startLevel;
            this.updateUI();
        }
    }

    // 2. 게임 라이프사이클 제어
    start() {
        AudioSynth.init(); // 오디오 컨텍스트 활성화
        
        // 화면 숨김
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.add('hidden');
        document.getElementById('pause-screen').classList.add('hidden');

        // 상태 초기화
        this.board.reset();
        this.queue.reset();
        this.controls.reset();

        this.score = 0;
        this.lines = 0;
        this.level = this.settings.startLevel;
        this.timer = 0;
        
        this.pieceStats = { I: 0, O: 0, T: 0, S: 0, Z: 0, J: 0, L: 0 };
        this.lastClearWasDifficult = false;
        this.comboCount = -1;

        this.hasStarted = true;
        this.isPaused = false;
        this.isGameOver = false;

        // 첫 피스 소환
        this.spawnPiece();

        this.updateUI();

        // BGM 재생 시작
        AudioSynth.startMusic();
    }

    restart() {
        this.start();
    }

    togglePause() {
        if (!this.hasStarted || this.isGameOver) return;

        this.isPaused = !this.isPaused;
        const pauseScreen = document.getElementById('pause-screen');
        const btnPause = document.getElementById('btn-pause');

        if (this.isPaused) {
            pauseScreen.classList.remove('hidden');
            btnPause.textContent = 'RESUME';
            AudioSynth.stopMusic();
        } else {
            pauseScreen.classList.add('hidden');
            btnPause.textContent = 'PAUSE (P)';
            AudioSynth.startMusic();
            // 시간 누적 방지를 위해 초기화
            this.lastTime = performance.now();
        }
    }

    gameOver() {
        this.isGameOver = true;
        AudioSynth.stopMusic();
        AudioSynth.playGameOver();

        this.saveHighScore();

        document.getElementById('overlay-score-val').textContent = this.score;
        document.getElementById('game-over-screen').classList.remove('hidden');
    }

    // 3. 피스 스폰 및 락 딜레이 규칙
    spawnPiece() {
        this.currentPiece = this.queue.popNext();
        this.pieceStats[this.currentPiece.type]++;
        this.updateStatsUI();

        // 락 딜레이 관련 수치 리셋
        this.lockDelayCounter = 0;
        this.isLocking = false;
        this.lockResets = 0;

        // 스폰 즉시 충돌이 발생한다면 게임오버 (블록이 천장에 가득 참)
        if (!this.board.isValidPosition(this.currentPiece.matrix, this.currentPiece.col, this.currentPiece.row)) {
            this.gameOver();
        }
    }

    // 회전 또는 이동 시 락 딜레이 연장 처리 (Lock Delay Reset)
    resetLockDelay() {
        if (this.isLocking && this.lockResets < this.maxLockResets) {
            this.lockDelayCounter = 0;
            this.lockResets++;
        }
    }

    // 4. 조작 바인딩 메서드 (controls.js에서 호출)
    moveLeft() {
        if (this.currentPiece && this.board.isValidPosition(this.currentPiece.matrix, this.currentPiece.col - 1, this.currentPiece.row)) {
            this.currentPiece.col--;
            this.board.lastActionWasRotation = false;
            this.resetLockDelay();
            AudioSynth.playMove();
        }
    }

    moveRight() {
        if (this.currentPiece && this.board.isValidPosition(this.currentPiece.matrix, this.currentPiece.col + 1, this.currentPiece.row)) {
            this.currentPiece.col++;
            this.board.lastActionWasRotation = false;
            this.resetLockDelay();
            AudioSynth.playMove();
        }
    }

    rotateCW() {
        if (this.currentPiece) {
            const success = this.board.rotatePiece(this.currentPiece, 1);
            if (success) {
                this.resetLockDelay();
                AudioSynth.playRotate();
            }
        }
    }

    rotateCCW() {
        if (this.currentPiece) {
            const success = this.board.rotatePiece(this.currentPiece, -1);
            if (success) {
                this.resetLockDelay();
                AudioSynth.playRotate();
            }
        }
    }

    holdPiece() {
        if (this.isPaused || this.isGameOver || !this.currentPiece) return;

        const nextPiece = this.queue.hold(this.currentPiece);
        if (nextPiece) {
            this.currentPiece = nextPiece;
            this.lockDelayCounter = 0;
            this.isLocking = false;
            this.lockResets = 0;
            AudioSynth.playRotate();
        }
    }

    softDrop() {
        if (this.currentPiece && this.board.isValidPosition(this.currentPiece.matrix, this.currentPiece.col, this.currentPiece.row + 1)) {
            this.currentPiece.row++;
            this.score += 1; // 소프트 드롭 시 격자당 1점 추가
            this.updateUI();
            this.board.lastActionWasRotation = false;
            this.dropCounter = 0; // 중력 타이머 리셋
            this.resetLockDelay();
        }
    }

    hardDrop() {
        if (this.isPaused || this.isGameOver || !this.currentPiece) return;

        const ghost = this.board.getGhostRow(this.currentPiece);
        const dist = ghost - this.currentPiece.row;
        this.currentPiece.row = ghost;
        
        this.score += dist * 2; // 하드 드롭 시 격자당 2점 추가
        this.board.lastActionWasRotation = false;
        
        AudioSynth.playHardDrop();
        this.lockImmediate();
    }

    lockImmediate() {
        this.board.lockPiece(this.currentPiece);
        AudioSynth.playLock();

        // 1. 라인 삭제 및 점수 연산
        const fullLines = this.board.checkLineClears();
        
        // T-spin 판정
        const tspinResult = this.board.checkTSpin(this.currentPiece, fullLines.length);

        if (fullLines.length > 0) {
            // 라인 제거 애니메이션 개시
            this.board.startLineClear(fullLines);
            this.currentPiece = null; // 임시 해제
            
            // 제거 점수 및 효과 연동
            this.processScores(fullLines.length, tspinResult);
        } else {
            // 라인 제거가 없더라도 T-Spin 판정 확인
            if (tspinResult.isTSpin) {
                this.processScores(0, tspinResult);
            }
            this.comboCount = -1; // 콤보 단절
            this.spawnPiece();
        }
    }

    // 5. 스코어, 레벨업 룰엔진
    processScores(linesCount, tspin) {
        let baseScore = 0;
        let clearName = "";
        let isDifficult = false;

        // T-Spin 연산 분기
        if (tspin.isTSpin) {
            isDifficult = true;
            if (tspin.isMini) {
                if (linesCount === 0) {
                    baseScore = 100;
                    clearName = "T-SPIN MINI";
                } else if (linesCount === 1) {
                    baseScore = 200;
                    clearName = "T-SPIN MINI SINGLE";
                } else if (linesCount === 2) {
                    baseScore = 400;
                    clearName = "T-SPIN MINI DOUBLE";
                }
            } else {
                if (linesCount === 0) {
                    baseScore = 400;
                    clearName = "T-SPIN";
                } else if (linesCount === 1) {
                    baseScore = 800;
                    clearName = "T-SPIN SINGLE";
                } else if (linesCount === 2) {
                    baseScore = 1200;
                    clearName = "T-SPIN DOUBLE";
                } else if (linesCount === 3) {
                    baseScore = 1600;
                    clearName = "T-SPIN TRIPLE";
                }
            }
        } else {
            // 일반 라인 소거 점수
            if (linesCount === 1) {
                baseScore = 100;
                clearName = "SINGLE";
            } else if (linesCount === 2) {
                baseScore = 300;
                clearName = "DOUBLE";
            } else if (linesCount === 3) {
                baseScore = 500;
                clearName = "TRIPLE";
            } else if (linesCount === 4) {
                baseScore = 800;
                clearName = "TETRIS";
                isDifficult = true;
            }
        }

        if (baseScore === 0) return;

        let totalScore = baseScore * this.level;

        // Back-to-Back 보너스 (어려운 기술 연속 시 1.5배)
        if (isDifficult) {
            if (this.lastClearWasDifficult) {
                totalScore = Math.floor(totalScore * 1.5);
                clearName = "B2B " + clearName;
            }
            this.lastClearWasDifficult = true;
        } else if (linesCount > 0) {
            this.lastClearWasDifficult = false;
        }

        // 콤보 보너스
        if (linesCount > 0) {
            this.comboCount++;
            if (this.comboCount > 0) {
                totalScore += 50 * this.comboCount * this.level;
                clearName += `\nCOMBO x${this.comboCount}`;
            }
        }

        // 점수 갱신 및 플로팅 텍스트 팝업
        this.score += totalScore;
        this.board.addFloatingScore(clearName, totalScore);

        // 연출 효과
        if (linesCount === 4 || tspin.isTSpin) {
            this.board.triggerScreenShake(12);
            AudioSynth.playTetris();
        } else if (linesCount > 0) {
            AudioSynth.playLineClear();
        }

        // 라인 카운트 및 레벨업 반영
        if (linesCount > 0) {
            this.lines += linesCount;
            const newLevel = Math.floor(this.lines / 10) + this.settings.startLevel;
            
            if (newLevel > this.level) {
                this.level = Math.min(newLevel, 15); // 최대 15레벨
                AudioSynth.playLevelUp();
            }
        }

        this.updateUI();
    }

    // 6. 메인 프레임워크 게임 루프
    gameLoop(timestamp) {
        if (!this.lastTime) this.lastTime = timestamp;
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        if (this.hasStarted && !this.isPaused && !this.isGameOver) {
            this.controls.update(timestamp);
            
            // 타이머 카운터 (1초 도달 체크)
            this.timerCounter += deltaTime;
            if (this.timerCounter >= 1000) {
                this.timer++;
                this.timerCounter -= 1000;
                this.updateTimerUI();
            }

            // 라인 삭제 플래시 애니메이션 중에는 하강 일시 보류
            if (this.board.clearingLines.length > 0) {
                if (this.board.clearAnimTime <= 0) {
                    // 애니메이션 종료 시 실제 제거
                    this.board.executeLineClear();
                    this.spawnPiece();
                }
            } else if (this.currentPiece) {
                // 중력 낙하 처리
                this.dropCounter += deltaTime;
                const gravityDelay = this.gravitySpeeds[this.level] || 15;

                if (this.dropCounter >= gravityDelay) {
                    this.tickGravity();
                    this.dropCounter = 0;
                }

                // 바닥 고정 락 딜레이 처리
                const isTouchingBottom = !this.board.isValidPosition(
                    this.currentPiece.matrix, 
                    this.currentPiece.col, 
                    this.currentPiece.row + 1
                );

                if (isTouchingBottom) {
                    if (!this.isLocking) {
                        this.isLocking = true;
                        this.lockDelayCounter = 0;
                    }
                    this.lockDelayCounter += deltaTime;
                    if (this.lockDelayCounter >= this.lockDelayLimit) {
                        this.lockImmediate();
                    }
                } else {
                    this.isLocking = false;
                }
            }
        }

        // 보드, 넥스트, 홀드 그래픽 렌더
        this.renderAll();

        requestAnimationFrame((t) => this.gameLoop(t));
    }

    tickGravity() {
        if (this.board.isValidPosition(this.currentPiece.matrix, this.currentPiece.col, this.currentPiece.row + 1)) {
            this.currentPiece.row++;
            this.board.lastActionWasRotation = false;
        }
    }

    renderAll() {
        // 메인보드 렌더
        this.board.render(this.currentPiece, this.settings.ghostPiece, this.settings.grid);
        
        // 홀드 & 넥스트 렌더
        if (this.hasStarted) {
            this.board.drawQueueCanvas('canvas-hold', this.queue.holdPiece);
            this.board.drawNextQueue(this.queue.nextQueue);
        }
    }

    // 7. UI 업데이트 유틸리티
    updateUI() {
        const padScore = String(this.score).padStart(6, '0');
        const padHighScore = String(this.highScore).padStart(6, '0');
        const padLines = String(this.lines).padStart(3, '0');
        const padLevel = String(this.level).padStart(2, '0');

        document.getElementById('val-score').textContent = padScore;
        document.getElementById('val-highscore').textContent = padHighScore;
        document.getElementById('val-lines').textContent = padLines;
        document.getElementById('val-level').textContent = padLevel;
    }

    updateTimerUI() {
        const m = Math.floor(this.timer / 60);
        const s = this.timer % 60;
        const padM = String(m).padStart(2, '0');
        const padS = String(s).padStart(2, '0');
        document.getElementById('val-time').textContent = `${padM}:${padS}`;
    }

    updateStatsUI() {
        for (const type in this.pieceStats) {
            const count = this.pieceStats[type];
            const padVal = String(count).padStart(3, '0');
            const targetEl = document.getElementById(`stat-count-${type.toLowerCase()}`);
            if (targetEl) {
                targetEl.textContent = padVal;
            }
        }
    }
}

// 윈도우 로드 시 자동 가동
window.addEventListener('load', () => {
    window.gameInstance = new TetrisGame();
});
