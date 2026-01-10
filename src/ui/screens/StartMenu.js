import { statsManager } from '../../settings/StatsManager.js';

export class StartMenu {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.element = document.createElement('div');
        this.element.className = 'screen-overlay start-menu';
        
        this.element.innerHTML = `
            <div class="menu-content">
                <h1 class="game-title">SKY<span class="highlight">GLIDE</span></h1>
                <p class="subtitle">High Velocity Voxel Flight</p>
                
                <div class="highscore-container">
                    <span class="hs-label">HIGH SCORE</span>
                    <span class="hs-value" id="start-highscore">0</span>
                </div>

                <button id="btn-start" class="btn-primary" style="margin-bottom: 20px;">INITIATE FLIGHT</button>

                <div class="button-group">
                    <button id="btn-htp-start" class="btn-secondary">HOW TO PLAY</button>
                    <button id="btn-settings-start" class="btn-secondary">SETTINGS</button>
                </div>
                
                <div class="controls-preview">
                    <span>WASD to Steer</span> • <span>SPACE to Jump/Fly</span>
                </div>
            </div>
        `;

        this.elHighScore = this.element.querySelector('#start-highscore');

        this.element.querySelector('#btn-start').addEventListener('click', (e) => {
            e.stopPropagation();
            this.uiManager.onGameStart();
        });

        this.element.querySelector('#btn-settings-start').addEventListener('click', (e) => {
            e.stopPropagation();
            this.uiManager.showScreen('SETTINGS');
        });

        this.element.querySelector('#btn-htp-start').addEventListener('click', (e) => {
            e.stopPropagation();
            this.uiManager.showScreen('HOWTOPLAY');
        });

        document.getElementById('ui-layer').appendChild(this.element);
        
        // Initial update
        this.updateHighScore();
    }

    updateHighScore() {
        if (this.elHighScore) {
            this.elHighScore.textContent = statsManager.getHighScore();
        }
    }

    show() { 
        this.updateHighScore();
        this.element.style.display = 'flex'; 
    }
    hide() { this.element.style.display = 'none'; }
}