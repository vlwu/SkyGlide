import { settingsManager } from '../../settings/SettingsManager.js';

const FPS_STEPS = [
    { value: 0, label: 'VSync' },
    { value: 30, label: '30 FPS' },
    { value: 60, label: '60 FPS' },
    { value: 120, label: '120 FPS' },
    { value: 999, label: 'Unlimited' }
];

export class SettingsMenu {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.element = document.createElement('div');
        this.element.className = 'screen-overlay settings-menu';
        this.activeBinding = null;

        this.render();
        this.setupEventListeners();
        
        document.getElementById('ui-layer').appendChild(this.element);
    }

    render() {
        const keys = settingsManager.settings.keys;
        const currentFps = settingsManager.get('fpsLimit');
        const currentSens = settingsManager.get('sensitivity');
        
        // Find the index that corresponds to the current setting
        // Default to index 0 (VSync) if not found
        let sliderIndex = FPS_STEPS.findIndex(step => step.value === currentFps);
        if (sliderIndex === -1) sliderIndex = 0; 

        this.element.innerHTML = `
            <div class="menu-content settings-content">
                <h2>SETTINGS</h2>
                
                <div class="settings-section">
                    <h3>INPUT</h3>
                    <div class="setting-row">
                        <span>Sensitivity</span>
                        <div class="slider-container">
                            <input type="range" id="sens-slider" 
                                min="0.1" max="5.0" step="0.1" 
                                value="${currentSens}">
                            <span id="sens-value" class="slider-value">${currentSens.toFixed(1)}</span>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>MOVEMENT</h3>
                    <div class="setting-row">
                        <span>Forward</span>
                        <button class="btn-bind" data-action="forward">${this.formatKey(keys.forward)}</button>
                    </div>
                    <div class="setting-row">
                        <span>Backward</span>
                        <button class="btn-bind" data-action="backward">${this.formatKey(keys.backward)}</button>
                    </div>
                    <div class="setting-row">
                        <span>Left</span>
                        <button class="btn-bind" data-action="left">${this.formatKey(keys.left)}</button>
                    </div>
                    <div class="setting-row">
                        <span>Right</span>
                        <button class="btn-bind" data-action="right">${this.formatKey(keys.right)}</button>
                    </div>
                    <div class="setting-row">
                        <span>Jump / Fly</span>
                        <button class="btn-bind" data-action="jump">${this.formatKey(keys.jump)}</button>
                    </div>
                    <div class="setting-row">
                        <span>Quick Reset</span>
                        <button class="btn-bind" data-action="reset">${this.formatKey(keys.reset)}</button>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>PERFORMANCE</h3>
                    <div class="setting-row">
                        <span>Max FPS</span>
                        <div class="slider-container">
                            <input type="range" id="fps-slider" 
                                min="0" max="${FPS_STEPS.length - 1}" step="1" 
                                value="${sliderIndex}">
                            <span id="fps-value" class="slider-value">${FPS_STEPS[sliderIndex].label}</span>
                        </div>
                    </div>
                </div>

                <button id="btn-settings-back" class="btn-secondary">BACK</button>
            </div>
        `;
    }

    formatKey(code) {
        if (!code) return '???';
        if (code.startsWith('Key')) return code.slice(3);
        if (code === 'Space') return 'SPACE';
        return code;
    }

    setupEventListeners() {
        this.element.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-bind')) {
                const action = e.target.dataset.action;
                this.startRebind(action, e.target);
            }
        });

        // Sensitivity Slider Logic
        const sensSlider = this.element.querySelector('#sens-slider');
        const sensLabel = this.element.querySelector('#sens-value');

        sensSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            sensLabel.textContent = val.toFixed(1);
            settingsManager.set('sensitivity', val);
        });

        // FPS Slider Logic
        const fpsSlider = this.element.querySelector('#fps-slider');
        const fpsLabel = this.element.querySelector('#fps-value');

        fpsSlider.addEventListener('input', (e) => {
            const index = parseInt(e.target.value);
            const step = FPS_STEPS[index];
            
            // Update UI immediately
            fpsLabel.textContent = step.label;
            
            // Save setting
            settingsManager.set('fpsLimit', step.value);
        });

        const backBtn = this.element.querySelector('#btn-settings-back');
        backBtn.addEventListener('click', () => {
            this.uiManager.goBack();
        });
    }

    startRebind(action, buttonEl) {
        if (this.activeBinding) return;
        
        buttonEl.textContent = '...';
        buttonEl.classList.add('binding');
        this.activeBinding = action;

        const onKeyDown = (e) => {
            e.preventDefault();
            e.stopPropagation();

            settingsManager.setKeybind(action, e.code);
            
            document.removeEventListener('keydown', onKeyDown);
            this.activeBinding = null;
            
            this.render(); 
            this.setupEventListeners(); 
        };

        document.addEventListener('keydown', onKeyDown, { once: true });
    }

    show() { this.element.style.display = 'flex'; }
    hide() { this.element.style.display = 'none'; }
}