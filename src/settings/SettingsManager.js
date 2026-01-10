export class SettingsManager {
    constructor() {
        this.defaults = {
            keys: {
                forward: 'KeyW',
                backward: 'KeyS',
                left: 'KeyA',
                right: 'KeyD',
                jump: 'Space',
                reset: 'KeyR'
            },
            fpsLimit: 0, // 0 = VSync (Browser Default)
            sensitivity: 1.0, // Multiplier for mouse sensitivity
            quality: 'HIGH' // Graphics Quality: LOW, MEDIUM, HIGH
        };
        
        this.settings = this.load();
    }

    load() {
        try {
            const stored = localStorage.getItem('skyglide_settings');
            if (stored) {
                // Merge with defaults to ensure new keys exist
                const parsed = JSON.parse(stored);
                return { 
                    ...this.defaults, 
                    ...parsed,
                    keys: { ...this.defaults.keys, ...parsed.keys }
                };
            }
        } catch (e) {
            console.error('Failed to load settings', e);
        }
        return JSON.parse(JSON.stringify(this.defaults));
    }

    save() {
        localStorage.setItem('skyglide_settings', JSON.stringify(this.settings));
    }

    get(key) {
        return this.settings[key];
    }

    set(key, value) {
        this.settings[key] = value;
        this.save();
    }

    getKeybind(action) {
        return this.settings.keys[action];
    }

    setKeybind(action, code) {
        this.settings.keys[action] = code;
        this.save();
    }
}

export const settingsManager = new SettingsManager();