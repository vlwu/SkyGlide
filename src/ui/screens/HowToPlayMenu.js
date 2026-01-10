import { settingsManager } from '../../settings/SettingsManager.js';

export class HowToPlayMenu {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.element = document.createElement('div');
        this.element.className = 'screen-overlay settings-menu'; 
        
        this.render();
        document.getElementById('ui-layer').appendChild(this.element);
    }

    formatKey(code) {
        if (!code) return '???';
        if (code.startsWith('Key')) return code.slice(3);
        if (code.startsWith('Digit')) return code.slice(5);
        if (code === 'Space') return 'SPACE';
        if (code === 'ShiftLeft') return 'L-SHIFT';
        if (code === 'ShiftRight') return 'R-SHIFT';
        if (code === 'ControlLeft') return 'L-CTRL';
        if (code === 'ControlRight') return 'R-CTRL';
        return code.toUpperCase();
    }

    render() {
        const k = settingsManager.settings.keys;
        const moveKeys = `${this.formatKey(k.forward)} / ${this.formatKey(k.left)} / ${this.formatKey(k.backward)} / ${this.formatKey(k.right)}`;

        this.element.innerHTML = `
            <div class="menu-content settings-content" style="max-width: 600px;">
                <h2>FLIGHT MANUAL</h2>
                
                <div class="htp-section">
                    <h3>CONTROLS</h3>
                    <div class="htp-grid">
                        <div class="htp-row"><span class="key">MOUSE</span> <span>Pitch & Yaw</span></div>
                        <div class="htp-row"><span class="key">${this.formatKey(k.jump)}</span> <span>Jump / Activate Wings</span></div>
                        <div class="htp-row"><span class="key">${this.formatKey(k.boost)}</span> <span>Turbo Boost (Requires Energy)</span></div>
                        <div class="htp-row"><span class="key">${this.formatKey(k.brake)}</span> <span>Air Brake / Tight Turn</span></div>
                        <div class="htp-row"><span class="key" style="font-size: 0.8rem">${moveKeys}</span> <span>Ground Movement</span></div>
                        <div class="htp-row"><span class="key">${this.formatKey(k.reset)}</span> <span>Quick Restart</span></div>
                    </div>
                </div>

                <div class="htp-section">
                    <h3>PHYSICS ENGINE</h3>
                    <p class="htp-desc">You are piloting a glider. Momentum is your lifeblood.</p>
                    <ul class="htp-list">
                        <li><strong>DIVE</strong> to gain speed. <strong>CLIMB</strong> to gain height.</li>
                        <li><strong>PROXIMITY:</strong> Fly close to terrain to recharge <strong>BOOST</strong> and earn points.</li>
                        <li><strong>BRAKE:</strong> Sacrifice speed to make sharper turns.</li>
                        <li>Collect Rings to recharge Boost instantly.</li>
                    </ul>
                </div>

                <button id="btn-htp-back" class="btn-secondary">BACK</button>
            </div>
        `;

        this.element.querySelector('#btn-htp-back').addEventListener('click', (e) => {
            e.stopPropagation();
            this.uiManager.goBack();
        });
    }

    show() { 
        this.render(); // Re-render to check for keybind updates
        this.element.style.display = 'flex'; 
    }
    
    hide() { this.element.style.display = 'none'; }
}