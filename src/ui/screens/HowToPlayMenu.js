import { settingsManager } from '../../settings/SettingsManager.js';

export class HowToPlayMenu {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.element = document.createElement('div');
        this.element.className = 'screen-overlay settings-menu'; 

        this.element.innerHTML = `
            <div class="menu-content settings-content" style="max-width: 600px;">
                <h2>FLIGHT MANUAL</h2>
                
                <div class="htp-section">
                    <h3>CONTROLS</h3>
                    <div class="htp-grid">
                        <div class="htp-row"><span class="key">MOUSE</span> <span>Pitch & Yaw</span></div>
                        <div class="htp-row"><span class="key">WASD</span> <span>Ground Control at Spawn</span></div>
                        <div class="htp-row"><span class="key">SPACE</span> <span>Jump / Activate Wings</span></div>
                        <div class="htp-row"><span class="key">R</span> <span>Quick Restart</span></div>
                    </div>
                </div>

                <div class="htp-section">
                    <h3>PHYSICS ENGINE</h3>
                    <p class="htp-desc">You are piloting a glider. Momentum is your lifeblood.</p>
                    <ul class="htp-list">
                        <li><strong>DIVE</strong> (Pitch Down) to convert altitude into <strong>SPEED</strong>.</li>
                        <li><strong>CLIMB</strong> (Pitch Up) to trade speed for <strong>ALTITUDE</strong>.</li>
                        <li>If you lose too much speed, you will <strong>STALL</strong> and fall.</li>
                    </ul>
                </div>

                <div class="htp-section">
                    <h3>OBJECTIVES</h3>
                    <ul class="htp-list">
                        <li>Fly through <strong>RINGS</strong> to replenish speed and score points.</li>
                        <li>Avoid terrain and stay within atmospheric limits (Ceiling/Floor).</li>
                        <li>Find the optimal path to maintain high velocity.</li>
                    </ul>
                </div>

                <button id="btn-htp-back" class="btn-secondary">BACK</button>
            </div>
        `;

        this.element.querySelector('#btn-htp-back').addEventListener('click', (e) => {
            e.stopPropagation();
            this.uiManager.goBack();
        });

        document.getElementById('ui-layer').appendChild(this.element);
    }

    show() { this.element.style.display = 'flex'; }
    hide() { this.element.style.display = 'none'; }
}