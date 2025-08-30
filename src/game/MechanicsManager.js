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
            const y = Math.random() * 200 + 100;
            const z = Math.random() * WEATHER_CONFIG.RAIN_AREA_SIZE - WEATHER_CONFIG.RAIN_AREA_SIZE / 2;
            vertices.push(x, y, z);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

        const material = new THREE.PointsMaterial({
            color: 0xaaaaee,
            size: 0.8,
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
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
            const updraftPosition = new THREE.Vector3(x, y, z);

            const geometry = new THREE.BufferGeometry();
            const vertices = [];
            const particleVelocities = [];

            for (let i = 0; i < UPDRAFT_CONFIG.PARTICLE_COUNT; i++) {
                vertices.push(x, y, z); // All particles start at the center
                particleVelocities.push(new THREE.Vector3(
                    (Math.random() - 0.5) * 0.3,
                    Math.random() * 1.0 + 0.8,
                    (Math.random() - 0.5) * 0.3
                ));
            }

            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

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
                position: updraftPosition,
                baseY: y,
                velocities: particleVelocities,
                playerInside: false,
            });
        }
    }

    update(playerPos) {
        const particleGravity = -0.02;

        this.activeUpdrafts.forEach(updraft => {
            const positions = updraft.mesh.geometry.attributes.position.array;
            const velocities = updraft.velocities;

            for (let i = 0; i < velocities.length; i++) {
                const i3 = i * 3;

                velocities[i].y += particleGravity;

                positions[i3 + 0] += velocities[i].x;
                positions[i3 + 1] += velocities[i].y;
                positions[i3 + 2] += velocities[i].z;

                if (positions[i3 + 1] < updraft.baseY) {
                    positions[i3 + 0] = updraft.position.x;
                    positions[i3 + 1] = updraft.position.y;
                    positions[i3 + 2] = updraft.position.z;

                    velocities[i].set(
                        (Math.random() - 0.5) * 0.3,
                        Math.random() * 1.0 + 0.8,
                        (Math.random() - 0.5) * 0.3
                    );
                }
            }
            updraft.mesh.geometry.attributes.position.needsUpdate = true;
        });


        if (this.isRaining) {
            this.rainParticles.position.set(playerPos.x, playerPos.y, playerPos.z);

            const positions = this.rainParticles.geometry.attributes.position.array;
            for (let i = 0; i < positions.length; i += 3) {
                positions[i + 1] += WEATHER_CONFIG.RAIN_FALL_SPEED;


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
        this.updateWeather('CLEAR');
    }
}