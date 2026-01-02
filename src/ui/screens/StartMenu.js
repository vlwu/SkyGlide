export class StartMenu {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.element = document.createElement('div');
        this.element.className = 'screen-overlay start-menu';
        
        this.element.innerHTML = `
            <div class="menu-content">
                <h1 class="game-title">SKY<span class="highlight">GLIDE</span></h1>
                <p class="subtitle">High Velocity Voxel Flight</p>
                
                <div class="button-group">
                    <button id="btn-start" class="btn-primary">INITIATE FLIGHT</button>
                    <button id="btn-settings-start" class="btn-secondary">SETTINGS</button>
                </div>
                
                <div class="controls-preview">
                    <span>WASD to Steer</span> • <span>SPACE to Jump/Fly</span>
                </div>
            </div>
        `;

        this.element.querySelector('#btn-start').addEventListener('click', (e) => {
            e.stopPropagation();
            this.uiManager.onGameStart();
        });

        this.element.querySelector('#btn-settings-start').addEventListener('click', (e) => {
            e.stopPropagation();
            this.uiManager.showScreen('SETTINGS');
        });

        document.getElementById('ui-layer').appendChild(this.element);
    }

    show() { this.element.style.display = 'flex'; }
    hide() { this.element.style.display = 'none'; }
}