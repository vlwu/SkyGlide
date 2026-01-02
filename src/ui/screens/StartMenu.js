export class StartMenu {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.element = document.createElement('div');
        this.element.className = 'screen-overlay start-menu';
        
        this.element.innerHTML = `
            <div class="menu-content">
                <h1 class="game-title">SKY<span class="highlight">GLIDE</span></h1>
                <p class="subtitle">High Velocity Voxel Flight</p>
                
                <button id="btn-start" class="btn-primary">INITIATE FLIGHT</button>
                
                <div class="controls-preview">
                    <span>WASD to Steer</span> • <span>SPACE to Jump/Fly</span>
                </div>
            </div>
        `;

        // Attach event listener to the button, not the whole screen
        this.element.querySelector('#btn-start').addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent bubbling issues
            this.uiManager.onGameStart();
        });

        document.getElementById('ui-layer').appendChild(this.element);
    }

    show() { this.element.style.display = 'flex'; }
    hide() { this.element.style.display = 'none'; }
}