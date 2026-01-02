import { StartMenu } from './screens/StartMenu.js';
import { HUD } from './screens/HUD.js';
import { PauseMenu } from './screens/PauseMenu.js';
import { SettingsMenu } from './screens/SettingsMenu.js';

export class UIManager {
    constructor(player) {
        this.player = player;
        this.container = document.getElementById('ui-layer');

        // Initialize Components
        this.startMenu = new StartMenu(this);
        this.hud = new HUD(this);
        this.pauseMenu = new PauseMenu(this);
        this.settingsMenu = new SettingsMenu(this);

        this.screens = [this.startMenu, this.hud, this.pauseMenu, this.settingsMenu];
        
        this.activeScreen = null;
        this.previousScreen = null; // For "Back" functionality
        
        this.showScreen('START');
    }

    showScreen(screenName) {
        // Hide all screens first
        this.screens.forEach(s => s.hide());

        // Update History (unless we are just going back)
        if (screenName !== 'BACK') {
            if (this.activeScreen && this.activeScreen !== screenName) {
                 // Don't save HUD in history for settings (HUD -> Settings makes no sense usually)
                 if (this.activeScreen === 'START' || this.activeScreen === 'PAUSE') {
                     this.previousScreen = this.activeScreen;
                 }
            }
        }

        const target = screenName === 'BACK' ? this.previousScreen : screenName;

        switch(target) {
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
            case 'SETTINGS':
                this.settingsMenu.show();
                this.activeScreen = 'SETTINGS';
                break;
        }
    }

    goBack() {
        this.showScreen('BACK');
    }

    onGameStart() {
        this.showScreen('HUD');
        this.requestLock();
    }

    onGamePause() {
        this.showScreen('PAUSE');
        document.exitPointerLock();
    }

    onGameResume() {
        this.showScreen('HUD');
        this.requestLock();
    }

    requestLock() {
        const promise = document.body.requestPointerLock();
        
        if (promise && promise.catch) {
            promise.catch((err) => {
                // Suppress verbose error logging for expected cancellation
                if (err.name !== 'SecurityError') {
                    console.warn('Pointer lock failed:', err);
                }

                if (this.activeScreen === 'HUD') {
                    this.onGamePause();
                }
            });
        }
    }
}