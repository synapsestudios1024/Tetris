/* ==========================================================================
   Retro Neon Tetris - Board, Rendering & Rules Engine
   ========================================================================== */

class TetrisBoard {
    constructor(cols = 10, rows = 20) {
        this.cols = cols;
        this.rows = rows;
        this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));
        
        // 캔버스 연동
        this.canvas = document.getElementById('canvas-board');
        this.ctx = this.canvas.getContext('2d');
        
        // 블록 크기 계산
        this.blockSize = this.canvas.width / this.cols;

        // 파티클 및 애니메이션 효과 상태
        this.particles = [];
        this.floatingScores = [];
        this.shakeIntensity = 0;
        this.clearingLines = [];
        this.clearAnimTime = 0; // 프레임 단위 또는 ms 단위 카운터
        this.clearAnimDuration = 12; // 총 프레임

        // T-Spin 연산을 위한 직전 조작 기록
        this.lastActionWasRotation = false;
        this.lastKickIndex = 0; // 직전 회전에서 성공한 Kick 인덱스
    }

    // 1. 충돌 검사
    isValidPosition(matrix, col, row) {
        for (let r = 0; r < matrix.length; r++) {
            for (let c = 0; c < matrix[r].length; c++) {
                if (matrix[r][c] !== 0) {
                    const boardCol = col + c;
                    const boardRow = row + r;

                    // 벽 충돌 검사
                    if (boardCol < 0 || boardCol >= this.cols || boardRow >= this.rows) {
                        return false;
                    }

                    // 기존에 고정된 블록과의 충돌 검사 (화면 윗부분은 제외)
                    if (boardRow >= 0 && this.grid[boardRow][boardCol] !== 0) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    // 2. SRS 벽 차기 회전 적용
    rotatePiece(piece, dir) {
        const nextRotation = piece.getRotateState(dir);
        let rotatedMatrix;
        if (dir === 1) {
            rotatedMatrix = piece.rotateMatrixCW();
        } else {
            rotatedMatrix = piece.rotateMatrixCCW();
        }

        // O 조각은 회전 검사 생략 (모양이 대칭)
        if (piece.type === 'O') {
            piece.matrix = rotatedMatrix;
            piece.rotation = nextRotation;
            this.lastActionWasRotation = true;
            this.lastKickIndex = 0;
            return true;
        }

        // 알맞은 오프셋 테이블 가져오기
        const offsets = (piece.type === 'I') ? SRS_OFFSETS_I : SRS_OFFSETS_NORMAL;

        // 5가지의 Kick 테스트 실행
        for (let i = 0; i < 5; i++) {
            const currentRotationState = piece.rotation;
            const targetRotationState = nextRotation;

            // dx, dy 계산 (A오프셋 - B오프셋)
            const dx = offsets[currentRotationState][i][0] - offsets[targetRotationState][i][0];
            const dy = offsets[currentRotationState][i][1] - offsets[targetRotationState][i][1];

            const testCol = piece.col + dx;
            const testRow = piece.row - dy; // +y가 위이므로 빼줍니다.

            if (this.isValidPosition(rotatedMatrix, testCol, testRow)) {
                // 성공! 위치 갱신 및 회전 완료
                piece.matrix = rotatedMatrix;
                piece.col = testCol;
                piece.row = testRow;
                piece.rotation = nextRotation;
                
                this.lastActionWasRotation = true;
                this.lastKickIndex = i;
                return true;
            }
        }

        return false; // 회전 실패
    }

    // 3. 고스트 피스 위치(최종 착지 위치) 계산
    getGhostRow(piece) {
        let ghostRow = piece.row;
        while (this.isValidPosition(piece.matrix, piece.col, ghostRow + 1)) {
            ghostRow++;
        }
        return ghostRow;
    }

    // 4. 셀 속성 검사 (T-Spin용 경계 처리 포함)
    isCellOccupied(col, row) {
        if (col < 0 || col >= this.cols || row >= this.rows) {
            return true; // 벽 바깥도 고정 블록 취급
        }
        if (row < 0) {
            return false; // 천장 위는 빈 칸 취급
        }
        return this.grid[row][col] !== 0;
    }

    // 5. T-Spin 판정 (3-Corner 룰)
    checkTSpin(piece, linesCleared) {
        if (piece.type !== 'T' || !this.lastActionWasRotation) {
            return { isTSpin: false, isMini: false };
        }

        // T 조각의 중심 좌표 (3x3 매트릭스 중심)
        const centerCol = piece.col + 1;
        const centerRow = piece.row + 1;

        // 4개 모퉁이의 고정 여부 확인
        const tl = this.isCellOccupied(centerCol - 1, centerRow - 1);
        const tr = this.isCellOccupied(centerCol + 1, centerRow - 1);
        const bl = this.isCellOccupied(centerCol - 1, centerRow + 1);
        const br = this.isCellOccupied(centerCol + 1, centerRow + 1);

        let occupiedCorners = 0;
        if (tl) occupiedCorners++;
        if (tr) occupiedCorners++;
        if (bl) occupiedCorners++;
        if (br) occupiedCorners++;

        // 3개 이상의 모퉁이가 차있지 않다면 T-Spin이 아님
        if (occupiedCorners < 3) {
            return { isTSpin: false, isMini: false };
        }

        // T-Spin Mini 여부 판정
        // T 조각의 앞부분(돌출된 1칸이 향하는 방향의 좌우 모퉁이) 확인
        let frontLeft, frontRight;
        switch (piece.rotation) {
            case 0: // 위쪽 방향 ㅗ
                frontLeft = tl; frontRight = tr;
                break;
            case 1: // 오른쪽 방향 ㅏ
                frontLeft = tr; frontRight = br;
                break;
            case 2: // 아래쪽 방향 ㅜ
                frontLeft = bl; frontRight = br;
                break;
            case 3: // 왼쪽 방향 ㅓ
                frontLeft = tl; frontRight = bl;
                break;
        }

        // 마지막 킥이 4번 째 테스트(색인 4)가 아니고, 앞부분 모퉁이 중 비어있는 곳이 있다면 Mini 처리
        const isMini = !(frontLeft && frontRight) && (this.lastKickIndex !== 4);

        return { isTSpin: true, isMini: isMini };
    }

    // 6. 보드에 블록 고정
    lockPiece(piece) {
        for (let r = 0; r < piece.matrix.length; r++) {
            for (let c = 0; c < piece.matrix[r].length; c++) {
                if (piece.matrix[r][c] !== 0) {
                    const boardRow = piece.row + r;
                    const boardCol = piece.col + c;
                    
                    if (boardRow >= 0) {
                        this.grid[boardRow][boardCol] = piece.type;
                    }
                }
            }
        }
    }

    // 7. 가득 찬 라인 체크
    checkLineClears() {
        const fullLines = [];
        for (let r = 0; r < this.rows; r++) {
            if (this.grid[r].every(cell => cell !== 0)) {
                fullLines.push(r);
            }
        }
        return fullLines;
    }

    // 8. 라인 지우기 애니메이션 트리거
    startLineClear(lines) {
        this.clearingLines = lines;
        this.clearAnimTime = this.clearAnimDuration;
        
        // 라인이 제거되는 좌표 근처에 파티클 효과 추가
        lines.forEach(r => {
            const y = r * this.blockSize + this.blockSize / 2;
            for (let c = 0; c < this.cols; c++) {
                const x = c * this.blockSize + this.blockSize / 2;
                const cellType = this.grid[r][c];
                const color = TETROMINOES[cellType]?.color || '#ffffff';
                this.spawnLineClearParticles(x, y, color);
            }
        });
    }

    // 9. 실제 그리드 라인 갱신 (지운 후 아래로 내리기)
    executeLineClear() {
        this.clearingLines.forEach(r => {
            // 해당 행 삭제 후 맨 위에 빈 행 추가
            this.grid.splice(r, 1);
            this.grid.unshift(Array(this.cols).fill(0));
        });
        this.clearingLines = [];
    }

    // 10. 이펙트 추가 (파티클, 플로팅 텍스트, 화면 흔들림)
    spawnLineClearParticles(x, y, color) {
        for (let i = 0; i < 4; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 10,
                y: y + (Math.random() - 0.5) * 10,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 1.0) * 6,
                color: color,
                size: Math.random() * 5 + 3,
                alpha: 1.0,
                decay: Math.random() * 0.04 + 0.03
            });
        }
    }

    triggerScreenShake(intensity = 8) {
        this.shakeIntensity = intensity;
    }

    addFloatingScore(text, score) {
        this.floatingScores.push({
            text: `${text}\n+${score}`,
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            vy: -1.2,
            alpha: 1.0,
            scale: 1.0,
            life: 60 // 1초 지속
        });
    }

    // 11. 렌더링 파트
    drawBlock(ctx, x, y, type, size, opacity = 1.0, isGhost = false) {
        const data = TETROMINOES[type];
        if (!data) return;

        ctx.save();
        ctx.globalAlpha = opacity;

        if (isGhost) {
            // 고스트 피스 그리기: 반투명 점선 테두리
            ctx.strokeStyle = data.color;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
            
            ctx.fillStyle = data.color;
            ctx.globalAlpha = opacity * 0.15;
            ctx.fillRect(x + 3, y + 3, size - 6, size - 6);
        } else {
            // 고급 3D 베벨(Bevel) 스타일 블록 렌더링
            const pad = 1.5;
            const rSize = size - pad * 2;
            
            // 본체 사각형
            ctx.fillStyle = data.color;
            ctx.fillRect(x + pad, y + pad, rSize, rSize);

            // 밝은 하이라이트 (상단 및 좌측 테두리)
            ctx.fillStyle = data.colorLight;
            ctx.beginPath();
            ctx.moveTo(x + pad, y + pad);
            ctx.lineTo(x + pad + rSize, y + pad);
            ctx.lineTo(x + pad + rSize - 3, y + pad + 3);
            ctx.lineTo(x + pad + 3, y + pad + 3);
            ctx.lineTo(x + pad + 3, y + pad + rSize - 3);
            ctx.lineTo(x + pad, y + pad + rSize);
            ctx.fill();

            // 어두운 그림자 (하단 및 우측 테두리)
            ctx.fillStyle = data.colorDark;
            ctx.beginPath();
            ctx.moveTo(x + pad + rSize, y + pad + rSize);
            ctx.lineTo(x + pad + rSize, y + pad);
            ctx.lineTo(x + pad + rSize - 3, y + pad + 3);
            ctx.lineTo(x + pad + rSize - 3, y + pad + rSize - 3);
            ctx.lineTo(x + pad + 3, y + pad + rSize - 3);
            ctx.lineTo(x + pad, y + pad + rSize);
            ctx.fill();

            // 중앙 광원 반사 네온 원/네모 느낌 추가
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.fillRect(x + pad + 4, y + pad + 4, 3, 3);
        }

        ctx.restore();
    }

    // 12. 메인 보드 화면 그리기
    render(currentPiece, showGhost = true, showGrid = true) {
        this.ctx.save();
        
        // 화면 흔들림 효과 연산
        if (this.shakeIntensity > 0) {
            const dx = (Math.random() - 0.5) * this.shakeIntensity;
            const dy = (Math.random() - 0.5) * this.shakeIntensity;
            this.ctx.translate(dx, dy);
            this.shakeIntensity *= 0.9;
            if (this.shakeIntensity < 0.2) this.shakeIntensity = 0;
        }

        // 보드 배경 청소
        this.ctx.fillStyle = '#020208';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 보드 가이드 그리드선 그리기
        if (showGrid) {
            this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.04)';
            this.ctx.lineWidth = 1;
            for (let c = 0; c <= this.cols; c++) {
                this.ctx.beginPath();
                this.ctx.moveTo(c * this.blockSize, 0);
                this.ctx.lineTo(c * this.blockSize, this.canvas.height);
                this.ctx.stroke();
            }
            for (let r = 0; r <= this.rows; r++) {
                this.ctx.beginPath();
                this.ctx.moveTo(0, r * this.blockSize);
                this.ctx.lineTo(this.canvas.width, r * this.blockSize);
                this.ctx.stroke();
            }
        }

        // 고정된 블록들 그리기
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.grid[r][c] !== 0) {
                    this.drawBlock(this.ctx, c * this.blockSize, r * this.blockSize, this.grid[r][c], this.blockSize);
                }
            }
        }

        // 라인 클리어 플래시 효과 그리기
        if (this.clearAnimTime > 0) {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${this.clearAnimTime / this.clearAnimDuration})`;
            this.clearingLines.forEach(r => {
                this.ctx.fillRect(0, r * this.blockSize, this.canvas.width, this.blockSize);
            });
            this.clearAnimTime--;
        }

        // 고스트 피스 그리기
        if (currentPiece && showGhost && this.clearAnimTime === 0) {
            const ghostRow = this.getGhostRow(currentPiece);
            if (ghostRow > currentPiece.row) {
                for (let r = 0; r < currentPiece.matrix.length; r++) {
                    for (let c = 0; c < currentPiece.matrix[r].length; c++) {
                        if (currentPiece.matrix[r][c] !== 0) {
                            this.drawBlock(
                                this.ctx, 
                                (currentPiece.col + c) * this.blockSize, 
                                (ghostRow + r) * this.blockSize, 
                                currentPiece.type, 
                                this.blockSize, 
                                0.5, 
                                true
                            );
                        }
                    }
                }
            }
        }

        // 활성 낙하 블록 그리기
        if (currentPiece && this.clearAnimTime === 0) {
            for (let r = 0; r < currentPiece.matrix.length; r++) {
                for (let c = 0; c < currentPiece.matrix[r].length; c++) {
                    if (currentPiece.matrix[r][c] !== 0) {
                        const drawRow = currentPiece.row + r;
                        if (drawRow >= 0) {
                            this.drawBlock(
                                this.ctx, 
                                (currentPiece.col + c) * this.blockSize, 
                                drawRow * this.blockSize, 
                                currentPiece.type, 
                                this.blockSize
                            );
                        }
                    }
                }
            }
        }

        // 파티클 업데이트 및 드로잉
        this.updateAndDrawParticles();

        // 플로팅 스코어 업데이트 및 드로잉
        this.updateAndDrawFloatingScores();

        this.ctx.restore();
    }

    // 파티클 연산 및 드로잉
    updateAndDrawParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= p.decay;

            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            this.ctx.save();
            this.ctx.globalAlpha = p.alpha;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }
    }

    // 플로팅 점수 연산 및 드로잉
    updateAndDrawFloatingScores() {
        for (let i = this.floatingScores.length - 1; i >= 0; i--) {
            const fs = this.floatingScores[i];
            fs.y += fs.vy;
            fs.life--;
            fs.alpha = Math.min(1.0, fs.life / 20);

            if (fs.life <= 0) {
                this.floatingScores.splice(i, 1);
                continue;
            }

            this.ctx.save();
            this.ctx.globalAlpha = fs.alpha;
            this.ctx.fillStyle = '#ffea00';
            this.ctx.shadowColor = 'rgba(255, 234, 0, 0.6)';
            this.ctx.shadowBlur = 8;
            
            // 폰트 설정
            this.ctx.font = "bold 13px 'Press Start 2P', monospace";
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            // 멀티라인 줄 나누기
            const lines = fs.text.split('\n');
            lines.forEach((line, index) => {
                this.ctx.fillText(line, fs.x, fs.y + (index * 16));
            });
            
            this.ctx.restore();
        }
    }

    // 13. 미니 캔버스 그리기 (Hold & Next 전용)
    drawQueueCanvas(canvasId, pieceType) {
        const canvas = document.getElementById(canvasId);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!pieceType) return;

        const data = TETROMINOES[pieceType];
        const shape = data.shape;
        const matrixSize = shape.length;
        
        // 캔버스 크기에 따른 블록 크기 최적 조율 (가로 세로 4블록 대칭 구조 기준)
        const cellSz = 24; 
        
        // 조각 크기를 구해 중앙 배치 정렬
        let minX = matrixSize, maxX = -1, minY = matrixSize, maxY = -1;
        for (let r = 0; r < matrixSize; r++) {
            for (let c = 0; c < matrixSize; c++) {
                if (shape[r][c] !== 0) {
                    if (c < minX) minX = c;
                    if (c > maxX) maxX = c;
                    if (r < minY) minY = r;
                    if (r > maxY) maxY = r;
                }
            }
        }

        const activeW = (maxX - minX + 1) * cellSz;
        const activeH = (maxY - minY + 1) * cellSz;
        
        const startX = (canvas.width - activeW) / 2 - minX * cellSz;
        const startY = (canvas.height - activeH) / 2 - minY * cellSz;

        for (let r = 0; r < matrixSize; r++) {
            for (let c = 0; c < matrixSize; c++) {
                if (shape[r][c] !== 0) {
                    this.drawBlock(
                        ctx, 
                        startX + c * cellSz, 
                        startY + r * cellSz, 
                        pieceType, 
                        cellSz
                    );
                }
            }
        }
    }

    // 14. Next 큐 5개 그리기
    drawNextQueue(queue) {
        const canvas = document.getElementById('canvas-next');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const cellSz = 20;
        const gap = 70; // 조각간 수직 간격

        for (let i = 0; i < queue.length; i++) {
            const pieceType = queue[i];
            const data = TETROMINOES[pieceType];
            const shape = data.shape;
            const matrixSize = shape.length;

            // 중앙 오프셋 계산
            let minX = matrixSize, maxX = -1, minY = matrixSize, maxY = -1;
            for (let r = 0; r < matrixSize; r++) {
                for (let c = 0; c < matrixSize; c++) {
                    if (shape[r][c] !== 0) {
                        if (c < minX) minX = c;
                        if (c > maxX) maxX = c;
                        if (r < minY) minY = r;
                        if (r > maxY) maxY = r;
                    }
                }
            }

            const activeW = (maxX - minX + 1) * cellSz;
            const activeH = (maxY - minY + 1) * cellSz;
            
            const startX = (canvas.width - activeW) / 2 - minX * cellSz;
            const startY = 15 + i * gap + (gap - activeH) / 2 - minY * cellSz;

            for (let r = 0; r < matrixSize; r++) {
                for (let c = 0; c < matrixSize; c++) {
                    if (shape[r][c] !== 0) {
                        this.drawBlock(
                            ctx, 
                            startX + c * cellSz, 
                            startY + r * cellSz, 
                            pieceType, 
                            cellSz,
                            i === 0 ? 1.0 : 0.45 // 첫 번째만 밝게, 나머지는 희미하게 처리
                        );
                    }
                }
            }
        }
    }

    reset() {
        this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(0));
        this.particles = [];
        this.floatingScores = [];
        this.shakeIntensity = 0;
        this.clearingLines = [];
        this.clearAnimTime = 0;
        this.lastActionWasRotation = false;
        this.lastKickIndex = 0;
        
        // 캔버스 초기 청소
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}
