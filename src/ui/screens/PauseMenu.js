export class PauseMenu {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.element = document.createElement('div');
        this.element.className = 'screen-overlay pause-menu';
        
        this.element.innerHTML = `
            <h1>PAUSED</h1>
            
            <div class="button-group-vertical">
                <button id="btn-resume" class="btn-primary">RESUME</button>
                <button id="btn-settings-pause" class="btn-secondary">SETTINGS</button>
            </div>

            <div class="controls-hint">
                Click RESUME or press ESC
            </div>
        `;

        this.element.querySelector('#btn-resume').addEventListener('click', (e) => {
            e.stopPropagation();
            this.uiManager.onGameResume();
        });

        this.element.querySelector('#btn-settings-pause').addEventListener('click', (e) => {
            e.stopPropagation();
            this.uiManager.showScreen('SETTINGS');
        });

        document.getElementById('ui-layer').appendChild(this.element);

        this.handleInput = this.handleInput.bind(this);
        this.openTime = 0;
    }

    handleInput(e) {
        // Prevent immediate re-triggering from the key release of the specific press that paused the game
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
        // Use keyup to ensure the 'Escape' press that triggers the lock request isn't the same one interpreted as 'Exit Lock'
        document.addEventListener('keyup', this.handleInput);
    }

    hide() { 
        this.element.style.display = 'none'; 
        document.removeEventListener('keyup', this.handleInput);
    }
}