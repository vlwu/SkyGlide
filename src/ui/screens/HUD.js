export class HUD {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.element = document.createElement('div');
        this.element.id = 'hud';
        
        this.element.innerHTML = `
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
            <div class="hud-item">
                <span class="label">STATE</span>
                <span class="value" id="hud-state">WALKING</span>
            </div>
        `;

        document.getElementById('ui-layer').appendChild(this.element);
        
        // Cache references
        this.elScore = this.element.querySelector('#hud-score');
        this.elAlt = this.element.querySelector('#hud-alt');
        this.elSpeed = this.element.querySelector('#hud-speed');
        this.elState = this.element.querySelector('#hud-state');

        // State Cache for Dirty Checking
        this.lastScore = -1;
        this.lastAlt = -1;
        this.lastSpeed = -1;
        this.lastState = '';
    }

    update(player, score) {
        // Optimization: Dirty Checking
        // Only touch the DOM if values actually changed.
        // DOM updates trigger reflows which are very expensive.

        if (this.lastScore !== score) {
            this.elScore.textContent = score;
            this.lastScore = score;
        }

        const alt = Math.round(player.position.y);
        if (this.lastAlt !== alt) {
            this.elAlt.textContent = alt;
            this.lastAlt = alt;
        }

        // Throttle speed precision to avoid jittery updates
        const speed = Math.round(player.velocity.length() * 10) / 10;
        if (this.lastSpeed !== speed) {
            this.elSpeed.textContent = speed.toFixed(1);
            this.lastSpeed = speed;
        }

        if (this.lastState !== player.state) {
            this.elState.textContent = player.state;
            this.lastState = player.state;
        }
    }

    show() { this.element.style.display = 'flex'; }
    hide() { this.element.style.display = 'none'; }
}