/* ==========================================================================
   Retro Neon Tetris - Piece & Tetromino Logic
   ========================================================================== */

// 1. 테트로미노 정의
const TETROMINOES = {
    'I': {
        shape: [
            [0, 0, 0, 0],
            [1, 1, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0]
        ],
        color: '#00f3ff', // Neon Cyan
        colorLight: '#80f9ff',
        colorDark: '#008ba3',
        class: 'piece-i'
    },
    'O': {
        shape: [
            [1, 1],
            [1, 1]
        ],
        color: '#ffea00', // Neon Yellow
        colorLight: '#fff580',
        colorDark: '#a39500',
        class: 'piece-o'
    },
    'T': {
        shape: [
            [0, 1, 0],
            [1, 1, 1],
            [0, 0, 0]
        ],
        color: '#b026ff', // Neon Purple
        colorLight: '#d799ff',
        colorDark: '#700fb3',
        class: 'piece-t'
    },
    'S': {
        shape: [
            [0, 1, 1],
            [1, 1, 0],
            [0, 0, 0]
        ],
        color: '#39ff14', // Neon Green
        colorLight: '#99ff8c',
        colorDark: '#1fa300',
        class: 'piece-s'
    },
    'Z': {
        shape: [
            [1, 1, 0],
            [0, 1, 1],
            [0, 0, 0]
        ],
        color: '#ff0055', // Neon Red
        colorLight: '#ff80aa',
        colorDark: '#b30033',
        class: 'piece-z'
    },
    'J': {
        shape: [
            [1, 0, 0],
            [1, 1, 1],
            [0, 0, 0]
        ],
        color: '#0066ff', // Neon Blue
        colorLight: '#80b3ff',
        colorDark: '#0040a3',
        class: 'piece-j'
    },
    'L': {
        shape: [
            [0, 0, 1],
            [1, 1, 1],
            [0, 0, 0]
        ],
        color: '#ff9900', // Neon Orange
        colorLight: '#ffcc80',
        colorDark: '#b36b00',
        class: 'piece-l'
    }
};

// SRS (Super Rotation System) 오프셋 테이블 정의
// [회전 상태][테스트 인덱스][x, y] - Cartesian 좌표계 (+y가 위)
const SRS_OFFSETS_NORMAL = {
    0: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
    1: [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    2: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
    3: [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]]
};

const SRS_OFFSETS_I = {
    0: [[0, 0], [-1, 0], [2, 0], [-1, 0], [2, 0]],
    1: [[-1, 0], [0, 0], [0, 0], [0, 1], [0, -2]],
    2: [[-1, 1], [1, 1], [-2, 1], [1, 0], [-2, 0]],
    3: [[0, 1], [0, 1], [0, 1], [0, -1], [0, 2]]
};

class Piece {
    constructor(type, matrix = null) {
        this.type = type;
        this.data = TETROMINOES[type];
        this.matrix = matrix || this.data.shape.map(row => [...row]);
        this.rotation = 0; // 0: 0도, 1: 90도(CW), 2: 180도, 3: 270도(CCW)
        
        // 스폰 위치 계산 (가로 10열의 중앙)
        this.col = Math.floor((10 - this.matrix[0].length) / 2);
        // O 조각과 I 조각 등 스폰 규칙에 맞춰 높이 조절
        this.row = (this.type === 'I') ? -1 : -2;
    }

    // 시계 방향 행렬 회전 (실제 데이터 회전)
    rotateMatrixCW() {
        const n = this.matrix.length;
        const result = Array.from({ length: n }, () => Array(n).fill(0));
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                result[c][n - 1 - r] = this.matrix[r][c];
            }
        }
        return result;
    }

    // 반시계 방향 행렬 회전
    rotateMatrixCCW() {
        const n = this.matrix.length;
        const result = Array.from({ length: n }, () => Array(n).fill(0));
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                result[n - 1 - c][r] = this.matrix[r][c];
            }
        }
        return result;
    }

    // 회전 상태 인덱스 갱신
    getRotateState(dir) {
        return (this.rotation + dir + 4) % 4;
    }
}

// 2. 7-Bag 무작위 생성기
class BagRandomizer {
    constructor() {
        this.bag = [];
    }

    refill() {
        const pieces = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
        // Fisher-Yates 셔플 알고리즘
        for (let i = pieces.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
        }
        this.bag = pieces;
    }

    next() {
        if (this.bag.length === 0) {
            this.refill();
        }
        return this.bag.pop();
    }
}

// 3. Next 큐 & Hold 상태 관리
class GameQueue {
    constructor() {
        this.randomizer = new BagRandomizer();
        this.nextQueue = [];
        this.holdPiece = null;
        this.canHold = true; // 낙하 세션 당 1회 제한

        // 초기 Next 큐 5개 채우기
        for (let i = 0; i < 5; i++) {
            this.nextQueue.push(this.randomizer.next());
        }
    }

    // 큐에서 다음 피스 가져오기 및 채우기
    popNext() {
        const nextType = this.nextQueue.shift();
        this.nextQueue.push(this.randomizer.next());
        this.canHold = true; // 홀드 잠금 해제
        return new Piece(nextType);
    }

    // 홀드 처리
    hold(currentPiece) {
        if (!this.canHold) return null;

        const originalHold = this.holdPiece;
        this.holdPiece = currentPiece.type;
        this.canHold = false;

        if (originalHold) {
            return new Piece(originalHold);
        } else {
            return this.popNext();
        }
    }

    reset() {
        this.randomizer = new BagRandomizer();
        this.nextQueue = [];
        this.holdPiece = null;
        this.canHold = true;
        for (let i = 0; i < 5; i++) {
            this.nextQueue.push(this.randomizer.next());
        }
    }
}
