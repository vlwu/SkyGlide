import { StartMenu } from './screens/StartMenu.js';
import { HUD } from './screens/HUD.js';
import { PauseMenu } from './screens/PauseMenu.js';

export class UIManager {
    constructor(player) {
        this.player = player;
        this.container = document.getElementById('ui-layer');

        // Initialize Components
        this.startMenu = new StartMenu(this);
        this.hud = new HUD(this);
        this.pauseMenu = new PauseMenu(this);

        this.screens = [this.startMenu, this.hud, this.pauseMenu];
        
        // Default State
        this.activeScreen = null;
        this.showScreen('START');
    }

    showScreen(screenName) {
        // Hide all screens first
        this.screens.forEach(s => s.hide());

        switch(screenName) {
            case 'START':
                this.startMenu.show();
                this.activeScreen = 'START';
                break;
            case 'HUD':
                this.hud.show();
                this.activeScreen = 'HUD';
                break;
            case 'PAUSE':
                this.pauseMenu.show();
                this.activeScreen = 'PAUSE';
                break;
        }
    }

    // Call this from main loop
    update() {
        if (this.activeScreen === 'HUD') {
            this.hud.update(this.player);
        }
    }

    onGameStart() {
        this.showScreen('HUD');
        document.body.requestPointerLock();
    }

    onGamePause() {
        this.showScreen('PAUSE');
        document.exitPointerLock();
    }

    onGameResume() {
        this.showScreen('HUD');
        document.body.requestPointerLock();
    }
}