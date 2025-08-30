import * as THREE from 'three';

export class AudioManager {
    constructor(camera) {
        this.listener = new THREE.AudioListener();
        camera.add(this.listener);

        this.audioLoader = new THREE.AudioLoader();
        this.sounds = {};
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;
        // The creation of an AudioContext is required by browsers to be tied to a user action.
        // We call this on the 'start game' click.
        this.listener.context.resume();
        this.isInitialized = true;
    }

    loadSound(name, audioUrl, loop = false, volume = 0.5) {
        const sound = new THREE.Audio(this.listener);
        // The 'audioUrl' is now the direct, Vite-processed path to the asset.
        this.audioLoader.load(audioUrl, (buffer) => {
            sound.setBuffer(buffer);
            sound.setLoop(loop);
            sound.setVolume(volume);
            this.sounds[name] = sound;
        }, undefined, (err) => {
            console.error(`Failed to load sound: ${name} from ${audioUrl}`, err);
        });
    }

    playSound(name) {
        if (this.sounds[name] && !this.sounds[name].isPlaying) {
            this.sounds[name].play();
        }
    }

    pauseAll() {
        for (const soundKey in this.sounds) {
            const sound = this.sounds[soundKey];
            if (sound.isPlaying) {
                sound.pause();
            }
        }
    }

    resumeAll() {
        if (!this.isInitialized) return;
        for (const soundKey in this.sounds) {
            const sound = this.sounds[soundKey];
            // Sounds that should always be playing (like wind) are resumed.
            if (sound.getLoop() && !sound.isPlaying) {
                 sound.play();
            }
        }
    }

    updateWindSound(speed) {
        if (!this.sounds.wind || !this.sounds.wind_rush) return;

        // Normalize speed to a 0-1 range for volume control. Max speed is around 0.8.
        const normalizedSpeed = Math.min(speed / 0.8, 1.0);

        // Ambient wind is louder at low speeds and fades out
        const ambientVolume = (1 - normalizedSpeed) * 0.4;
        this.sounds.wind.setVolume(ambientVolume);

        // Rushing wind is louder at high speeds
        const rushVolume = normalizedSpeed * 0.7;
        this.sounds.wind_rush.setVolume(rushVolume);
    }
}