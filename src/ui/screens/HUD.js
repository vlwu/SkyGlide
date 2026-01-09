export class HUD {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.element = document.createElement('div');
        this.element.id = 'hud';
        
        this.score = 0;

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
    }

    update(player, score) {
        this.score = score;
        this.elScore.textContent = this.score;
        this.elAlt.textContent = Math.round(player.position.y);
        const speed = Math.round(player.velocity.length() * 10) / 10;
        this.elSpeed.textContent = speed.toFixed(1);
        this.elState.textContent = player.state;
    }

    show() { this.element.style.display = 'flex'; }
    hide() { this.element.style.display = 'none'; }
}