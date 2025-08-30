export class UIManager {
    constructor(callbacks) {
        this.scoreElement = document.getElementById('score');
        this.speedElement = document.getElementById('speed');
        this.highScoreElement = document.getElementById('high-score');
        this.proximityBonusElement = document.getElementById('proximity-bonus');

        this.introOverlay = document.getElementById('intro-overlay');
        this.introHighScoreElement = document.getElementById('intro-high-score');

        this.gameOverOverlay = document.getElementById('game-over-overlay');
        this.gameOverScoreElement = document.getElementById('game-over-score');
        this.gameOverHighScoreElement = document.getElementById('game-over-high-score');

        this.pauseOverlay = document.getElementById('pause-overlay');
        this.pauseScoreElement = document.getElementById('pause-score');

        this.settingsOverlay = document.getElementById('settings-overlay');

        this.gameContainer = document.getElementById('game-container');


        const resumeButton = document.getElementById('resume-button');
        const settingsButton = document.getElementById('settings-button');
        const backFromSettingsButton = document.getElementById('back-from-settings-button');
        const fullscreenButton = document.getElementById('fullscreen-button');


        this.invertPitchToggle = document.getElementById('invert-pitch-toggle');
        this.sensitivitySlider = document.getElementById('sensitivity-slider');
        this.dayNightCycleSelect = document.getElementById('day-night-cycle-select');
        this.volumeSlider = document.getElementById('volume-slider');

        this.proximityBonusTimeout = null;


        this.introOverlay.addEventListener('click', callbacks.onStartGame);
        this.gameOverOverlay.addEventListener('click', callbacks.onRestartGame);
        resumeButton.addEventListener('click', callbacks.onTogglePause);
        settingsButton.addEventListener('click', () => this.showSettings(true));
        backFromSettingsButton.addEventListener('click', () => this.showSettings(false));
        fullscreenButton.addEventListener('click', callbacks.onToggleFullscreen);

        this.invertPitchToggle.addEventListener('change', (e) => callbacks.onSettingChange('invertMousePitch', e.target.checked));
        this.sensitivitySlider.addEventListener('input', (e) => callbacks.onSettingChange('mouseSensitivity', parseFloat(e.target.value)));
        this.dayNightCycleSelect.addEventListener('change', (e) => callbacks.onSettingChange('dayNightCycle', e.target.value));
        this.volumeSlider.addEventListener('input', (e) => callbacks.onSettingChange('masterVolume', parseFloat(e.target.value)));
    }

    updateScoreAndSpeed(score, speed) {
        this.scoreElement.textContent = `Score: ${Math.floor(score)}`;
        this.speedElement.textContent = `Speed: ${Math.floor(speed * 200)} km/h`;
    }

    showProximityBonus(bonus) {
        if (this.proximityBonusTimeout) clearTimeout(this.proximityBonusTimeout);

        this.proximityBonusElement.textContent = `+${Math.floor(bonus)} Proximity`;
        this.proximityBonusElement.style.opacity = '1';

        this.proximityBonusTimeout = setTimeout(() => {
            this.proximityBonusElement.style.opacity = '0';
        }, 1000);
    }

    updateHighScore(highScore) {
        const hsText = `High Score: ${highScore}`;
        this.highScoreElement.textContent = hsText;
        this.introHighScoreElement.textContent = hsText;
        this.gameOverHighScoreElement.textContent = hsText;
    }

    showIntro(visible) {
        if (visible) {
            this.introOverlay.style.display = 'flex';
            this.introOverlay.style.opacity = '1';
        } else {
            this.introOverlay.style.opacity = '0';
            setTimeout(() => this.introOverlay.style.display = 'none', 1500);
        }
    }

    showGameOver(visible, score, highScore) {
        if (visible) {
            this.gameOverScoreElement.textContent = `Final Score: ${Math.floor(score)}`;
            this.gameOverHighScoreElement.textContent = `High Score: ${highScore}`;
            this.gameOverOverlay.style.display = 'flex';
            setTimeout(() => this.gameOverOverlay.style.opacity = '1', 10);
        } else {
            this.gameOverOverlay.style.opacity = '0';
            setTimeout(() => this.gameOverOverlay.style.display = 'none', 1500);
        }
    }

    showPause(visible, score) {
        if (visible) {
            this.pauseScoreElement.textContent = `Score: ${Math.floor(score)}`;
            this.pauseOverlay.style.display = 'flex';
            setTimeout(() => this.pauseOverlay.style.opacity = '1', 10);
        } else {
            this.pauseOverlay.style.opacity = '0';
            setTimeout(() => this.pauseOverlay.style.display = 'none', 500);
        }
    }

    showSettings(visible) {
        if (visible) {
            this.showPause(false);
            this.settingsOverlay.style.display = 'flex';
            setTimeout(() => this.settingsOverlay.style.opacity = '1', 10);
        } else {
            this.settingsOverlay.style.opacity = '0';
            setTimeout(() => {
                this.settingsOverlay.style.display = 'none';
                this.showPause(true);
            }, 500);
        }
    }

    setInitialSettings(settings) {
        this.invertPitchToggle.checked = settings.invertMousePitch;
        this.sensitivitySlider.value = settings.mouseSensitivity;
        this.dayNightCycleSelect.value = settings.dayNightCycle || 'cycle';
        this.volumeSlider.value = settings.masterVolume;
    }

    requestPointerLock() {
        this.gameContainer.requestPointerLock();
    }
}