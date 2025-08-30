import * as THREE from 'three';
import { UPDRAFT_CONFIG, WEATHER_CONFIG } from './config.js';

const WATERFALL_PARTICLE_COUNT = 150;
const WATERFALL_WIDTH = 10;
const SPLASH_PARTICLE_COUNT = 100;

export class MechanicsManager {
    constructor(scene) {
        this.scene = scene;
        this.activeUpdrafts = [];
        this.activeWaterfalls = new Map();
        this.particleTexture = this.createParticleTexture();
        this.noiseTexture = this.createNoiseTexture();
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

    createNoiseTexture() {
        const canvas = document.createElement('canvas');
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        const imageData = context.createImageData(size, size);
        for (let i = 0; i < imageData.data.length; i += 4) {
            const lum = Math.floor(Math.random() * 255);
            imageData.data[i] = lum;
            imageData.data[i + 1] = lum;
            imageData.data[i + 2] = lum;
            imageData.data[i + 3] = 255;
        }
        context.putImageData(imageData, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    }


    createWaterfallMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                u_time: { value: 0 },
                u_noiseTexture: { value: this.noiseTexture },
                u_falloff: { value: 0.2 },
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float u_time;
                uniform sampler2D u_noiseTexture;
                uniform float u_falloff;
                varying vec2 vUv;

                void main() {
                    vec2 uv = vUv;
                    float speed = 2.0;
                    uv.y -= u_time * speed;

                    float noise = texture2D(u_noiseTexture, uv * vec2(1.0, 4.0)).r;
                    noise = pow(noise, 2.5);

                    float edgeFade = smoothstep(0.0, u_falloff, vUv.x) * (1.0 - smoothstep(1.0 - u_falloff, 1.0, vUv.x));

                    float alpha = noise * edgeFade * 0.4;

                    gl_FragColor = vec4(vec3(0.8, 0.9, 1.0), alpha);
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
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

    addWaterfalls(locations, chunkId) {
        const newWaterfalls = [];
        for (let i = 0; i < locations.length; i += 6) {
            const topPos = new THREE.Vector3(locations[i], locations[i + 1], locations[i + 2]);
            const bottomPos = new THREE.Vector3(locations[i + 3], locations[i + 4], locations[i + 5]);

            // 1. Create the flowing water mesh with custom geometry
            const flowGeometry = new THREE.BufferGeometry();

            const horizontalDir = new THREE.Vector2(bottomPos.x - topPos.x, bottomPos.z - topPos.z).normalize();
            const sideDir = new THREE.Vector2(horizontalDir.y, -horizontalDir.x);
            const sideVec = new THREE.Vector3(sideDir.x, 0, sideDir.y).multiplyScalar(WATERFALL_WIDTH / 2);

            const v_tl = new THREE.Vector3().copy(topPos).sub(sideVec);
            const v_tr = new THREE.Vector3().copy(topPos).add(sideVec);
            const v_bl = new THREE.Vector3().copy(bottomPos).sub(sideVec);
            const v_br = new THREE.Vector3().copy(bottomPos).add(sideVec);

            const positions = new Float32Array([
                v_tl.x, v_tl.y, v_tl.z, v_tr.x, v_tr.y, v_tr.z,
                v_bl.x, v_bl.y, v_bl.z, v_br.x, v_br.y, v_br.z,
            ]);

            const uvs = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);
            const indices = new Uint16Array([0, 2, 1, 2, 3, 1]);

            flowGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            flowGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            flowGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
            flowGeometry.computeVertexNormals();

            const flowMaterial = this.createWaterfallMaterial();
            const flowMesh = new THREE.Mesh(flowGeometry, flowMaterial);
            this.scene.add(flowMesh);

            // 2. Create the splash particle system at the bottom
            const splashGeometry = new THREE.BufferGeometry();
            const splashVertices = [];
            const splashVelocities = [];
            for (let j = 0; j < SPLASH_PARTICLE_COUNT; j++) {
                splashVertices.push(0, 0, 0);
                splashVelocities.push(new THREE.Vector3(
                    (Math.random() - 0.5) * 0.8, Math.random() * 1.5, (Math.random() - 0.5) * 0.8
                ));
            }
            splashGeometry.setAttribute('position', new THREE.Float32BufferAttribute(splashVertices, 3));
            const splashMaterial = new THREE.PointsMaterial({
                map: this.particleTexture, size: 3, transparent: true,
                opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
            });
            const splashParticles = new THREE.Points(splashGeometry, splashMaterial);
            splashParticles.position.copy(bottomPos);
            this.scene.add(splashParticles);

            newWaterfalls.push({
                flowMesh,
                splashParticles,
                splashVelocities,
            });
        }
        if (newWaterfalls.length > 0) {
            this.activeWaterfalls.set(chunkId, newWaterfalls);
        }
    }


    removeWaterfalls(chunkId) {
        if (this.activeWaterfalls.has(chunkId)) {
            const waterfalls = this.activeWaterfalls.get(chunkId);
            waterfalls.forEach(waterfall => {
                this.scene.remove(waterfall.flowMesh);
                waterfall.flowMesh.geometry.dispose();
                waterfall.flowMesh.material.dispose();

                this.scene.remove(waterfall.splashParticles);
                waterfall.splashParticles.geometry.dispose();
                waterfall.splashParticles.material.dispose();
            });
            this.activeWaterfalls.delete(chunkId);
        }
    }

    update(playerPos, elapsedTime) {
        const particleGravity = -0.05;

        this.activeUpdrafts.forEach(updraft => {
            const positions = updraft.mesh.geometry.attributes.position.array;
            const velocities = updraft.velocities;

            for (let i = 0; i < velocities.length; i++) {
                const i3 = i * 3;
                velocities[i].y += -0.02; // Gravity for updraft particles
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

        for (const waterfalls of this.activeWaterfalls.values()) {
            waterfalls.forEach(waterfall => {
                // Animate the flowing water shader
                waterfall.flowMesh.material.uniforms.u_time.value = elapsedTime;

                // Animate the splash particles
                const positions = waterfall.splashParticles.geometry.attributes.position.array;
                const velocities = waterfall.splashVelocities;
                for (let i = 0; i < velocities.length; i++) {
                    const i3 = i * 3;
                    velocities[i].y += particleGravity;
                    positions[i3 + 0] += velocities[i].x;
                    positions[i3 + 1] += velocities[i].y;
                    positions[i3 + 2] += velocities[i].z;

                    if (positions[i3 + 1] < 0) { // Reset particle when it falls below the base
                        positions[i3 + 0] = 0;
                        positions[i3 + 1] = 0;
                        positions[i3 + 2] = 0;
                        velocities[i].set(
                            (Math.random() - 0.5) * 0.8,
                             Math.random() * 1.5,
                            (Math.random() - 0.5) * 0.8
                        );
                    }
                }
                waterfall.splashParticles.geometry.attributes.position.needsUpdate = true;
            });
        }


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

        for (const chunkId of this.activeWaterfalls.keys()) {
            this.removeWaterfalls(chunkId);
        }
        this.activeWaterfalls.clear();

        this.updateWeather('CLEAR');
    }
}