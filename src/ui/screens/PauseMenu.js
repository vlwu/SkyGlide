export class PauseMenu {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.element = document.createElement('div');
        this.element.className = 'screen-overlay pause-menu';
        
        this.element.innerHTML = `
            <h1>PAUSED</h1>
            <div style="margin-bottom: 2rem; color: #00d2ff; font-family: monospace; font-size: 1.5rem;">
                SCORE: <span id="pause-score-val" style="color: white">0</span>
            </div>
            
            <div class="button-group-vertical">
                <button id="btn-resume" class="btn-primary">RESUME</button>
                <div class="button-group">
                    <button id="btn-retry-pause" class="btn-secondary">RETRY RUN</button>
                    <button id="btn-new-path-pause" class="btn-secondary">NEW PATH</button>
                </div>
                <div class="button-group">
                    <button id="btn-htp-pause" class="btn-secondary">HOW TO PLAY</button>
                    <button id="btn-settings-pause" class="btn-secondary">SETTINGS</button>
                </div>
                <button id="btn-exit-pause" class="btn-secondary" style="border-color: #ff3333; color: #ff3333;">EXIT TO MENU</button>
            </div>

            <div class="controls-hint">
                Click RESUME or press ESC
            </div>
        `;

        this.elScore = this.element.querySelector('#pause-score-val');

        // Resume
        this.element.querySelector('#btn-resume').addEventListener('click', (e) => {
            e.stopPropagation();
            this.uiManager.onGameResume();
        });

        // Retry (Same Path)
        const retryBtn = this.element.querySelector('#btn-retry-pause');
        retryBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            retryBtn.textContent = 'LOADING...';
            setTimeout(() => {
                this.uiManager.onGameRestart('soft');
                retryBtn.textContent = 'RETRY RUN';
            }, 50);
        });

        // New Path (New Seed)
        const newPathBtn = this.element.querySelector('#btn-new-path-pause');
        newPathBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            newPathBtn.textContent = 'GENERATING...';
            setTimeout(() => {
                this.uiManager.onGameRestart('hard');
                newPathBtn.textContent = 'NEW PATH';
            }, 50);
        });

        // Exit
        const exitBtn = this.element.querySelector('#btn-exit-pause');
        exitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.uiManager.onExitToMenu();
        });
        
        // Hover styling for exit
        exitBtn.addEventListener('mouseenter', () => exitBtn.style.background = 'rgba(255, 51, 51, 0.2)');
        exitBtn.addEventListener('mouseleave', () => exitBtn.style.background = 'transparent');

        // Settings
        this.element.querySelector('#btn-settings-pause').addEventListener('click', (e) => {
            e.stopPropagation();
            this.uiManager.showScreen('SETTINGS');
        });

        // How To Play
        this.element.querySelector('#btn-htp-pause').addEventListener('click', (e) => {
            e.stopPropagation();
            this.uiManager.showScreen('HOWTOPLAY');
        });

        document.getElementById('ui-layer').appendChild(this.element);

        this.handleInput = this.handleInput.bind(this);
        this.openTime = 0;
    }

    updateScore(score) {
        if (this.elScore) {
            this.elScore.textContent = Math.floor(score);
        }
    }

    handleInput(e) {
        if (Date.now() - this.openTime < 100) return;

        if (e.code === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            this.uiManager.onGameResume();
        }
    }

    show() { 
        this.element.style.display = 'flex'; 
        this.openTime = Date.now();
        document.addEventListener('keyup', this.handleInput);
    }

    hide() { 
        this.element.style.display = 'none'; 
        document.removeEventListener('keyup', this.handleInput);
    }
}