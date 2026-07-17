/* ==========================================================================
   Retro Neon Tetris - Audio Manager (Web Audio API Synthesizer)
   ========================================================================== */

class AudioSynthManager {
    constructor() {
        this.ctx = null;
        this.masterVolume = null;
        this.musicVolume = null;
        this.sfxVolume = null;
        
        // 볼륨 설정값 (0.0 ~ 1.0)
        this.musicVolumeVal = 0.5;
        this.sfxVolumeVal = 0.7;
        this.isMuted = false;

        // BGM 시퀀서 관련 변수
        this.musicIntervalId = null;
        this.currentNoteIndex = 0;
        this.nextNoteTime = 0.0;
        this.tempo = 150; // BPM
        this.isPlayingMusic = false;

        // classic Korobeiniki (Tetris Type A) 멜로디 데이터
        // [음높이(노트 이름), 박자(1 = 16분음표, 2 = 8분음표, 4 = 4분음표, 8 = 2분음표)]
        this.melody = [
            ['E5', 4], ['B4', 2], ['C5', 2], ['D5', 4], ['C5', 2], ['B4', 2],
            ['A4', 4], ['A4', 2], ['C5', 2], ['E5', 4], ['D5', 2], ['C5', 2],
            ['B4', 6], ['C5', 2], ['D5', 4], ['E5', 4],
            ['C5', 4], ['A4', 4], ['A4', 4], ['rest', 4],

            ['D5', 6], ['F5', 2], ['A5', 4], ['G5', 2], ['F5', 2],
            ['E5', 6], ['C5', 2], ['E5', 4], ['D5', 2], ['C5', 2],
            ['B4', 4], ['C5', 2], ['D5', 4], ['E5', 4],
            ['C5', 4], ['A4', 4], ['A4', 4], ['rest', 4]
        ];

        // 베이스라인 코드 진행 (삼각파로 연주)
        this.bassline = [
            ['E3', 4], ['E3', 4], ['E3', 4], ['E3', 4],
            ['A3', 4], ['A3', 4], ['A3', 4], ['A3', 4],
            ['G#3', 4], ['G#3', 4], ['E3', 4], ['E3', 4],
            ['A3', 4], ['A3', 4], ['A3', 4], ['A3', 4],

            ['D3', 4], ['D3', 4], ['D3', 4], ['D3', 4],
            ['C3', 4], ['C3', 4], ['C3', 4], ['C3', 4],
            ['E3', 4], ['E3', 4], ['E3', 4], ['E3', 4],
            ['A3', 4], ['A3', 4], ['A3', 4], ['A3', 4]
        ];

        // 주파수 매핑 테이블
        this.noteFreqs = {
            'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
            'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
            'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99, 'G#5': 830.61, 'A5': 880.00, 'B5': 987.77,
            'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00
        };
    }

    // 1. 오디오 컨텍스트 초기화 (사용자 첫 인터랙션 시 호출 필요)
    init() {
        if (this.ctx) return;
        
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContextClass();
        
        // 노드 트리 구축
        this.masterVolume = this.ctx.createGain();
        this.musicVolume = this.ctx.createGain();
        this.sfxVolume = this.ctx.createGain();

        this.masterVolume.connect(this.ctx.destination);
        this.musicVolume.connect(this.masterVolume);
        this.sfxVolume.connect(this.masterVolume);

        this.updateVolumes();
    }

    // 2. 볼륨 업데이트 및 음소거 설정
    updateVolumes() {
        if (!this.ctx) return;
        
        const master = this.isMuted ? 0 : 1;
        this.masterVolume.gain.setValueAtTime(master, this.ctx.currentTime);
        this.musicVolume.gain.setValueAtTime(this.musicVolumeVal, this.ctx.currentTime);
        this.sfxVolume.gain.setValueAtTime(this.sfxVolumeVal, this.ctx.currentTime);
    }

    setMusicVolume(volumePercentage) {
        this.musicVolumeVal = volumePercentage / 100;
        this.updateVolumes();
    }

    setSfxVolume(volumePercentage) {
        this.sfxVolumeVal = volumePercentage / 100;
        this.updateVolumes();
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        this.updateVolumes();
        return this.isMuted;
    }

    // 3. 효과음 신디사이저 구현 (SFX)

    // 블록 이동
    playMove() {
        this.init();
        if (this.isMuted || this.sfxVolumeVal === 0) return;
        
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.06);
        
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
        
        osc.connect(gain);
        gain.connect(this.sfxVolume);
        
        osc.start(now);
        osc.stop(now + 0.07);
    }

    // 블록 회전
    playRotate() {
        this.init();
        if (this.isMuted || this.sfxVolumeVal === 0) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(250, now);
        osc.frequency.setValueAtTime(350, now + 0.03);
        
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        
        osc.connect(gain);
        gain.connect(this.sfxVolume);
        
        osc.start(now);
        osc.stop(now + 0.09);
    }

    // 블록 고정 (Lock)
    playLock() {
        this.init();
        if (this.isMuted || this.sfxVolumeVal === 0) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.linearRampToValueAtTime(50, now + 0.12);
        
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        
        osc.connect(gain);
        gain.connect(this.sfxVolume);
        
        osc.start(now);
        osc.stop(now + 0.13);
    }

    // 하드 드롭 (Hard Drop) - 노이즈 버퍼 합성
    playHardDrop() {
        this.init();
        if (this.isMuted || this.sfxVolumeVal === 0) return;

        const now = this.ctx.currentTime;
        
        // 1. 드롭 타격용 저주파 삼각파
        const osc = this.ctx.createOscillator();
        const gainOsc = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.15);
        gainOsc.gain.setValueAtTime(0.5, now);
        gainOsc.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gainOsc);
        gainOsc.connect(this.sfxVolume);
        osc.start(now);
        osc.stop(now + 0.16);

        // 2. 화이트 노이즈 타격 효과
        const bufferSize = this.ctx.sampleRate * 0.12; // 0.12초 분량
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 400;

        const gainNoise = this.ctx.createGain();
        gainNoise.gain.setValueAtTime(0.3, now);
        gainNoise.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

        noiseNode.connect(filter);
        filter.connect(gainNoise);
        gainNoise.connect(this.sfxVolume);

        noiseNode.start(now);
        noiseNode.stop(now + 0.13);
    }

    // 한 줄/두 줄/세 줄 지우기 (Line Clear)
    playLineClear() {
        this.init();
        if (this.isMuted || this.sfxVolumeVal === 0) return;

        const now = this.ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5 (C major chord)
        
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, now + idx * 0.06);
            
            gain.gain.setValueAtTime(0.0, now);
            gain.gain.setValueAtTime(0.12, now + idx * 0.06);
            gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.06 + 0.15);
            
            osc.connect(gain);
            gain.connect(this.sfxVolume);
            
            osc.start(now + idx * 0.06);
            osc.stop(now + idx * 0.06 + 0.16);
        });
    }

    // 테트리스 (4줄 지우기) - 축하 아르페지오 및 슈팅음
    playTetris() {
        this.init();
        if (this.isMuted || this.sfxVolumeVal === 0) return;

        const now = this.ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // 빠른 7음 상행
        
        notes.forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, now + idx * 0.05);
            osc.frequency.exponentialRampToValueAtTime(freq * 1.2, now + idx * 0.05 + 0.1);
            
            gain.gain.setValueAtTime(0.0, now);
            gain.gain.setValueAtTime(0.15, now + idx * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.05 + 0.15);
            
            osc.connect(gain);
            gain.connect(this.sfxVolume);
            
            osc.start(now + idx * 0.05);
            osc.stop(now + idx * 0.05 + 0.16);
        });
    }

    // 레벨 업 (Level Up)
    playLevelUp() {
        this.init();
        if (this.isMuted || this.sfxVolumeVal === 0) return;

        const now = this.ctx.currentTime;
        const chords = [
            [261.63, 329.63, 392.00], // C
            [349.23, 440.00, 523.25], // F
            [392.00, 493.88, 587.33], // G
            [523.25, 659.25, 783.99]  // C5
        ];

        chords.forEach((chord, step) => {
            const stepTime = now + step * 0.15;
            chord.forEach(freq => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                
                osc.type = 'triangle';
                osc.frequency.value = freq;
                
                gain.gain.setValueAtTime(0.0, now);
                gain.gain.setValueAtTime(0.15, stepTime);
                gain.gain.exponentialRampToValueAtTime(0.01, stepTime + 0.2);
                
                osc.connect(gain);
                gain.connect(this.sfxVolume);
                
                osc.start(stepTime);
                osc.stop(stepTime + 0.25);
            });
        });
    }

    // 게임 오버 (Game Over) - 하행 디케이음
    playGameOver() {
        this.init();
        if (this.isMuted || this.sfxVolumeVal === 0) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(40, now + 1.2);
        
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 1.2);
        
        osc.connect(gain);
        gain.connect(this.sfxVolume);
        
        osc.start(now);
        osc.stop(now + 1.25);
    }

    // 4. 배경 음악 신디사이저 연주 (BGM)
    startMusic() {
        this.init();
        if (this.isPlayingMusic) return;
        
        this.isPlayingMusic = true;
        this.currentNoteIndex = 0;
        this.nextNoteTime = this.ctx.currentTime;
        
        // 50ms마다 한 번씩 스케줄링 체크
        this.musicIntervalId = setInterval(() => {
            this.scheduler();
        }, 50);
    }

    stopMusic() {
        if (this.musicIntervalId) {
            clearInterval(this.musicIntervalId);
            this.musicIntervalId = null;
        }
        this.isPlayingMusic = false;
    }

    scheduler() {
        if (!this.ctx) return;
        
        // lookahead: 다음 100ms 동안 연주할 노트를 예약
        while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
            this.scheduleNote(this.currentNoteIndex, this.nextNoteTime);
            
            // 다음 노트의 재생 시각 계산
            const noteLength = this.melody[this.currentNoteIndex][1];
            const secondsPerBeat = 60.0 / this.tempo;
            // 4분음표(4) = 1 beat, 8분음표(2) = 0.5 beat, 16분음표(1) = 0.25 beat
            const duration = (noteLength / 4) * secondsPerBeat;
            
            this.nextNoteTime += duration;
            this.currentNoteIndex = (this.currentNoteIndex + 1) % this.melody.length;
        }
    }

    scheduleNote(index, time) {
        if (this.isMuted || this.musicVolumeVal === 0) return;

        const note = this.melody[index];
        const noteName = note[0];
        const durationUnits = note[1];
        
        const secondsPerBeat = 60.0 / this.tempo;
        const duration = (durationUnits / 4) * secondsPerBeat;

        // 1. 멜로디 파트 (Square Wave - Chiptune 리드)
        if (noteName !== 'rest' && this.noteFreqs[noteName]) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = 'square';
            osc.frequency.setValueAtTime(this.noteFreqs[noteName], time);
            
            // 게인 엔벨로프 (8비트 스타카토/포르타멘토 느낌 연출)
            gain.gain.setValueAtTime(0.0, time);
            gain.gain.linearRampToValueAtTime(0.12, time + 0.01);
            gain.gain.setValueAtTime(0.12, time + duration - 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
            
            osc.connect(gain);
            gain.connect(this.musicVolume);
            
            osc.start(time);
            osc.stop(time + duration);
        }

        // 2. 베이스라인 동시 연주 (Triangle Wave - 따뜻한 베이스)
        // 멜로디의 마디에 맞춰 베이스 코드 연주
        const bassIndex = Math.floor(index / 2) % this.bassline.length;
        const bassNote = this.bassline[bassIndex];
        const bassNoteName = bassNote[0];
        
        if (bassNoteName !== 'rest' && this.noteFreqs[bassNoteName]) {
            const bassOsc = this.ctx.createOscillator();
            const bassGain = this.ctx.createGain();
            
            bassOsc.type = 'triangle';
            bassOsc.frequency.setValueAtTime(this.noteFreqs[bassNoteName], time);
            
            bassGain.gain.setValueAtTime(0.0, time);
            bassGain.gain.linearRampToValueAtTime(0.15, time + 0.02);
            bassGain.gain.exponentialRampToValueAtTime(0.001, time + duration - 0.01);
            
            bassOsc.connect(bassGain);
            bassGain.connect(this.musicVolume);
            
            bassOsc.start(time);
            bassOsc.stop(time + duration);
        }
    }
}

// 싱글톤 노출
const AudioSynth = new AudioSynthManager();
window.AudioSynth = AudioSynth;
