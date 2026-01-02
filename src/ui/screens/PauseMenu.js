export class PauseMenu {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.element = document.createElement('div');
        this.element.className = 'screen-overlay pause-menu';
        
        this.element.innerHTML = `
            <h1>PAUSED</h1>
            <p>Click to Resume</p>
            <div class="controls-hint">
                WASD - Move<br>
                SPACE - Fly<br>
                MOUSE - Look
            </div>
        `;

        // Click anywhere to resume
        this.element.addEventListener('click', () => {
            this.uiManager.onGameResume();
        });

        document.getElementById('ui-layer').appendChild(this.element);
    }

    show() { this.element.style.display = 'flex'; }
    hide() { this.element.style.display = 'none'; }
}