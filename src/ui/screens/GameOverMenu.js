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
                    <div class="button-group">
                        <button id="btn-retry-go" class="btn-primary" style="background: #ff3333; color: white;">RETRY RUN</button>
                        <button id="btn-new-path-go" class="btn-primary" style="background: #ff8833; color: white;">NEW PATH</button>
                    </div>
                    <button id="btn-menu-fail" class="btn-secondary" style="border-color: #ff3333; color: #ff3333;">MAIN MENU</button>
                </div>
            </div>
        `;

        // Retry Button (Soft Reset)
        const retryBtn = this.element.querySelector('#btn-retry-go');
        retryBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            retryBtn.textContent = 'INITIALIZING...';
            setTimeout(() => {
                this.uiManager.onGameRestart('soft');
                retryBtn.textContent = 'RETRY RUN';
            }, 100);
        });
        retryBtn.addEventListener('mouseenter', () => retryBtn.style.background = '#ff6666');
        retryBtn.addEventListener('mouseleave', () => retryBtn.style.background = '#ff3333');

        // New Path Button (Hard Reset)
        const newPathBtn = this.element.querySelector('#btn-new-path-go');
        newPathBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            newPathBtn.textContent = 'GENERATING...';
            setTimeout(() => {
                this.uiManager.onGameRestart('hard');
                newPathBtn.textContent = 'NEW PATH';
            }, 100);
        });
        newPathBtn.addEventListener('mouseenter', () => newPathBtn.style.background = '#ffaa66');
        newPathBtn.addEventListener('mouseleave', () => newPathBtn.style.background = '#ff8833');

        // Menu Button
        const menuBtn = this.element.querySelector('#btn-menu-fail');
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.uiManager.onExitToMenu();
        });

        document.getElementById('ui-layer').appendChild(this.element);
    }

    show() { this.element.style.display = 'flex'; }
    hide() { this.element.style.display = 'none'; }
}