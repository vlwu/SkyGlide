export class GameOverMenu {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.element = document.createElement('div');
        this.element.className = 'screen-overlay';
        this.element.style.background = 'rgba(20, 0, 0, 0.8)'; // Reddish tint for failure
        
        this.element.innerHTML = `
            <div class="menu-content" style="border-color: #ff3333;">
                <h1 class="game-title" style="font-size: 3.5rem; color: #ff3333;">SIGNAL <span style="color: white">LOST</span></h1>
                <p class="subtitle" style="color: #ff8888; margin-bottom: 2rem;">Altitude Critical</p>
                
                <div class="button-group-vertical">
                    <button id="btn-retry" class="btn-primary" style="background: #ff3333; color: white;">RETRY RUN</button>
                    <button id="btn-menu-fail" class="btn-secondary" style="border-color: #ff3333; color: #ff3333;">MAIN MENU</button>
                </div>
            </div>
        `;

        // Retry Button
        const retryBtn = this.element.querySelector('#btn-retry');
        retryBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Provide visual feedback
            retryBtn.textContent = 'INITIALIZING...';
            setTimeout(() => {
                this.uiManager.onGameRestart();
                retryBtn.textContent = 'RETRY RUN';
            }, 100);
        });
        
        retryBtn.addEventListener('mouseenter', () => retryBtn.style.background = '#ff6666');
        retryBtn.addEventListener('mouseleave', () => retryBtn.style.background = '#ff3333');

        // Menu Button
        const menuBtn = this.element.querySelector('#btn-menu-fail');
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.uiManager.showScreen('START');
        });

        document.getElementById('ui-layer').appendChild(this.element);
    }

    show() { this.element.style.display = 'flex'; }
    hide() { this.element.style.display = 'none'; }
}