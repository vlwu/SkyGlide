import { CONFIG } from '../../config/Config.js';
import { settingsManager } from '../../settings/SettingsManager.js';

export class HUD {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.element = document.createElement('div');
        this.element.id = 'hud';
        
        const boostKey = this.formatKey(settingsManager.getKeybind('boost'));

        this.element.innerHTML = `
            <div class="hud-top-right">
                <div class="hud-item hud-score">
                    <span class="label">RINGS</span>
                    <span class="value" id="hud-score">0</span>
                </div>
                <div class="hud-item">
                    <span class="label">ALTITUDE</span>
                    <span class="value" id="hud-alt">0</span>
                </div>
                <div class="hud-item">
                    <span class="label">SPEED</span>
                    <span class="value" id="hud-speed">0</span>
                </div>
            </div>

            <div class="hud-center-bottom">
                <div id="prox-alert" class="prox-alert">PROXIMITY +<span id="prox-val">0</span></div>
                <div class="energy-bar-container">
                    <div class="energy-bar" id="hud-energy"></div>
                    <span class="energy-label">BOOST</span>
                </div>
                <div class="boost-hint">[ ${boostKey} ] TO BOOST</div>
            </div>
        `;

        document.getElementById('ui-layer').appendChild(this.element);
        
        // Cache references
        this.elScore = this.element.querySelector('#hud-score');
        this.elAlt = this.element.querySelector('#hud-alt');
        this.elSpeed = this.element.querySelector('#hud-speed');
        this.elEnergy = this.element.querySelector('#hud-energy');
        this.elProx = this.element.querySelector('#prox-alert');
        this.elProxVal = this.element.querySelector('#prox-val');

        this.lastScore = -1;
        this.lastAlt = -1;
        this.lastSpeed = -1;
        this.lastProx = false;
        this.proxAccumulator = 0; // Visual accumulator
        
        this.lastUpdateTime = 0;
    }

    formatKey(code) {
        if (!code) return '???';
        if (code.startsWith('Key')) return code.slice(3);
        if (code.startsWith('Digit')) return code.slice(5);
        if (code === 'Space') return 'SPACE';
        if (code === 'ShiftLeft') return 'L-SHIFT';
        if (code === 'ControlLeft') return 'L-CTRL';
        return code.toUpperCase();
    }

    update(player, score, dt) {
        const now = performance.now();
        if (now - this.lastUpdateTime < 33) return; // 30 FPS update cap for UI
        this.lastUpdateTime = now;

        if (this.lastScore !== score) {
            this.elScore.textContent = Math.floor(score);
            this.lastScore = score;
        }

        const alt = Math.round(player.position.y);
        if (this.lastAlt !== alt) {
            this.elAlt.textContent = alt;
            this.lastAlt = alt;
        }

        const speed = Math.round(player.velocity.length() * 10) / 10;
        if (this.lastSpeed !== speed) {
            this.elSpeed.textContent = speed.toFixed(1);
            this.lastSpeed = speed;
        }

        // Update Energy Bar
        const energyPct = (player.energy / CONFIG.PLAYER.MAX_ENERGY) * 100;
        this.elEnergy.style.width = `${energyPct}%`;
        
        if (player.energy < CONFIG.PHYSICS.BOOST.COST * 0.1) {
             this.elEnergy.style.background = '#552222'; // Empty/Depleted
        } else if (player.isBoosting) {
             this.elEnergy.style.background = '#fff'; // Flash white when boosting
        } else {
             this.elEnergy.style.background = '#00d2ff'; // Normal
        }

        // Proximity Indicator
        if (player.isNearTerrain) {
            this.elProx.style.opacity = '1';
            this.proxAccumulator += CONFIG.GAME.PROXIMITY.SCORE_RATE * dt;
            this.elProxVal.textContent = Math.floor(this.proxAccumulator);
        } else {
            this.elProx.style.opacity = '0';
            this.proxAccumulator = 0;
        }
    }

    show() { this.element.style.display = 'flex'; }
    hide() { this.element.style.display = 'none'; }
}