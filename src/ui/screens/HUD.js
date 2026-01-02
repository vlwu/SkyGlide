export class HUD {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.element = document.createElement('div');
        this.element.id = 'hud';
        
        this.element.innerHTML = `
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
        this.elAlt = this.element.querySelector('#hud-alt');
        this.elSpeed = this.element.querySelector('#hud-speed');
        this.elState = this.element.querySelector('#hud-state');
    }

    update(player) {
        this.elAlt.textContent = Math.round(player.position.y);
        const speed = Math.round(player.velocity.length() * 10) / 10;
        this.elSpeed.textContent = speed.toFixed(1);
        this.elState.textContent = player.state;
    }

    show() { this.element.style.display = 'flex'; }
    hide() { this.element.style.display = 'none'; }
}