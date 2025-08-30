import * as THREE from 'three';
import { UPDRAFT_CONFIG, WEATHER_CONFIG } from './config.js';

export class MechanicsManager {
    constructor(scene) {
        this.scene = scene;
        this.activeUpdrafts = [];
        this.particleTexture = this.createParticleTexture();
        this.rainParticles = null;
        this.isRaining = false;

        this.createRainSystem();
    }

    createParticleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(canvas);
    }

    createRainSystem() {
        const geometry = new THREE.BufferGeometry();
        const vertices = [];

        for (let i = 0; i < WEATHER_CONFIG.RAIN_PARTICLE_COUNT; i++) {
            const x = Math.random() * WEATHER_CONFIG.RAIN_AREA_SIZE - WEATHER_CONFIG.RAIN_AREA_SIZE / 2;
            const y = Math.random() * 200 + 100; // Start high up
            const z = Math.random() * WEATHER_CONFIG.RAIN_AREA_SIZE - WEATHER_CONFIG.RAIN_AREA_SIZE / 2;
            vertices.push(x, y, z);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        const material = new THREE.PointsMaterial({
            color: 0xaaaaee,
            size: 0.8,
            transparent: true,
            opacity: 0.6,
            depthWrite: false, // Prevents weird rendering artifacts with other transparent objects
        });

        this.rainParticles = new THREE.Points(geometry, material);
        this.rainParticles.visible = false;
        this.scene.add(this.rainParticles);
    }

    updateWeather(weatherState) {
        this.isRaining = (weatherState === 'RAIN');
        this.rainParticles.visible = this.isRaining;
    }

    addUpdrafts(locations) {
        for (let i = 0; i < locations.length; i += 3) {
            const x = locations[i];
            const y = locations[i + 1];
            const z = locations[i + 2];

            const geometry = new THREE.BufferGeometry();
            const vertices = [];
            const velocities = [];

            for (let i = 0; i < UPDRAFT_CONFIG.PARTICLE_COUNT; i++) {
                vertices.push(
                    x + (Math.random() - 0.5) * UPDRAFT_CONFIG.RADIUS,
                    y + Math.random() * 100,
                    z + (Math.random() - 0.5) * UPDRAFT_CONFIG.RADIUS
                );
                velocities.push(
                    (Math.random() - 0.5) * 0.1,
                    Math.random() * 0.2 + 0.2,
                    (Math.random() - 0.5) * 0.1
                );
            }

            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setAttribute('velocity', new THREE.Float32BufferAttribute(velocities, 3));

            const material = new THREE.PointsMaterial({
                map: this.particleTexture,
                size: 2,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            });

            const particles = new THREE.Points(geometry, material);
            this.scene.add(particles);

            this.activeUpdrafts.push({
                mesh: particles,
                position: new THREE.Vector3(x, y, z),
                baseY: y,
            });
        }
    }

    update(playerPos) {
        // Animate Updrafts
        this.activeUpdrafts.forEach(updraft => {
            const positions = updraft.mesh.geometry.attributes.position.array;
            const velocities = updraft.mesh.geometry.attributes.velocity.array;

            for (let i = 0; i < positions.length; i += 3) {
                positions[i + 1] += velocities[i + 1];

                if (positions[i + 1] > updraft.baseY + 120) {
                    positions[i + 1] = updraft.baseY;
                }
            }
            updraft.mesh.geometry.attributes.position.needsUpdate = true;
        });

        // Animate Rain
        if (this.isRaining) {
            this.rainParticles.position.set(playerPos.x, playerPos.y, playerPos.z);

            const positions = this.rainParticles.geometry.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                positions[i + 1] += WEATHER_CONFIG.RAIN_FALL_SPEED;

                // If a particle has fallen below the player's view, recycle it to the top
                if (positions[i + 1] < -50) {
                    positions[i + 1] = 200;
                }
            }
            this.rainParticles.geometry.attributes.position.needsUpdate = true;
        }
    }

    getActiveUpdrafts() {
        return this.activeUpdrafts;
    }

    reset() {
        this.activeUpdrafts.forEach(updraft => {
            this.scene.remove(updraft.mesh);
            updraft.mesh.geometry.dispose();
            updraft.mesh.material.dispose();
        });
        this.activeUpdrafts = [];
        this.updateWeather('CLEAR'); // Ensure rain is off on reset
    }
}