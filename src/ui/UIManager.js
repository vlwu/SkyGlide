import { StartMenu } from './screens/StartMenu.js';
import { HUD } from './screens/HUD.js';
import { PauseMenu } from './screens/PauseMenu.js';
import { SettingsMenu } from './screens/SettingsMenu.js';
import { GameOverMenu } from './screens/GameOverMenu.js';
import { HowToPlayMenu } from './screens/HowToPlayMenu.js';
import { statsManager } from '../settings/StatsManager.js';

export class UIManager {
    constructor(player) {
        this.player = player;
        this.container = document.getElementById('ui-layer');
        this.restartHandler = null;
        this.exitHandler = null;
        this.settingsHandler = null;

        // Initialize Components
        this.startMenu = new StartMenu(this);
        this.hud = new HUD(this);
        this.pauseMenu = new PauseMenu(this);
        this.settingsMenu = new SettingsMenu(this);
        this.gameOverMenu = new GameOverMenu(this);
        this.howToPlayMenu = new HowToPlayMenu(this);

        this.screens = [
            this.startMenu, 
            this.hud, 
            this.pauseMenu, 
            this.settingsMenu,
            this.gameOverMenu,
            this.howToPlayMenu
        ];
        
        this.activeScreen = null;
        this.previousScreen = null; 
        
        this.showScreen('START');
    }

    setRestartHandler(fn) {
        this.restartHandler = fn;
    }

    setExitHandler(fn) {
        this.exitHandler = fn;
    }

    setSettingsChangeHandler(fn) {
        this.settingsHandler = fn;
    }

    notifySettingsChanged() {
        if (this.settingsHandler) {
            this.settingsHandler();
        }
    }

    showScreen(screenName) {
        this.screens.forEach(s => s.hide());

        if (screenName !== 'BACK') {
            if (this.activeScreen && this.activeScreen !== screenName) {
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
            case 'GAMEOVER':
                this.gameOverMenu.show();
                this.activeScreen = 'GAMEOVER';
                break;
            case 'HOWTOPLAY':
                this.howToPlayMenu.show();
                this.activeScreen = 'HOWTOPLAY';
                break;
        }
    }

    goBack() {
        this.showScreen('BACK');
    }

    onGameStart() {
        this.showScreen('HUD');
        this.requestLock();
        
        // Always trigger a soft start to ensure state is clean
        if (this.restartHandler) this.restartHandler('soft');
    }

    onGamePause() {
        this.showScreen('PAUSE');
        document.exitPointerLock();
    }

    onGameResume() {
        this.showScreen('HUD');
        this.requestLock();
    }
    
    onGameOver(stats = null) {
        if (this.activeScreen !== 'GAMEOVER') {
            if (stats) {
                const result = statsManager.saveRun(stats.score, stats.distance, stats.time);
                this.gameOverMenu.updateStats(stats.score, stats.distance, stats.time, result.isNewRecord);
            }
            this.showScreen('GAMEOVER');
            document.exitPointerLock();
        }
    }

    onGameRestart(mode = 'hard') {
        if (this.restartHandler) {
            this.restartHandler(mode);
            this.onGameResume();
        }
    }

    onExitToMenu() {
        if (this.exitHandler) this.exitHandler();
        this.showScreen('START');
        document.exitPointerLock();
    }

    requestLock() {
        const promise = document.body.requestPointerLock();
        
        if (promise && promise.catch) {
            promise.catch((err) => {
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