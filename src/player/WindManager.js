import * as THREE from 'three';
import { CONFIG } from '../config/Config.js';

export class WindManager {
    constructor(scene) {
        this.scene = scene;
        this.particles = null;
        this.wingTips = null;
        
        // Arrays for particle system
        this.count = CONFIG.GRAPHICS.WIND.COUNT;
        this.positions = new Float32Array(this.count * 3);
        this.velocities = new Float32Array(this.count);
        this.opacities = new Float32Array(this.count);
        
        this.dummyVec = new THREE.Vector3();
        this.tipPosLeft = new THREE.Vector3();
        this.tipPosRight = new THREE.Vector3();
        
        this.initScreenWind();
        this.initWingTips();
    }

    initScreenWind() {
        const geometry = new THREE.BufferGeometry();
        
        for (let i = 0; i < this.count; i++) {
            // Random positions in a cylinder around the camera
            const angle = Math.random() * Math.PI * 2;
            const radius = 5 + Math.random() * 15;
            this.positions[i * 3] = Math.cos(angle) * radius;
            this.positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
            this.positions[i * 3 + 2] = -Math.random() * 50; // In front of camera
            
            this.velocities[i] = 1.0 + Math.random();
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

        const material = new THREE.ShaderMaterial({
            uniforms: {
                uOpacity: { value: 0 }
            },
            vertexShader: `
                attribute float aVelocity;
                varying float vAlpha;
                void main() {
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    gl_PointSize = 4.0 * (10.0 / -mvPosition.z);
                }
            `,
            fragmentShader: `
                uniform float uOpacity;
                void main() {
                    gl_FragColor = vec4(1.0, 1.0, 1.0, uOpacity);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthTest: true,
            depthWrite: false
        });

        this.particles = new THREE.Points(geometry, material);
        this.particles.frustumCulled = false;
        this.scene.add(this.particles);
    }

    initWingTips() {
        // Simple trail system for wingtips
        this.tipCount = 40;
        this.tipGeo = new THREE.BufferGeometry();
        
        // Storing 2 trails (left, right) interweaved
        const pos = new Float32Array(this.tipCount * 2 * 3);
        const sizes = new Float32Array(this.tipCount * 2);
        
        this.tipGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.tipGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const mat = new THREE.ShaderMaterial({
            uniforms: { uColor: { value: new THREE.Color(0xffffff) } },
            vertexShader: `
                attribute float size;
                void main() {
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    gl_PointSize = size * (20.0 / -mvPosition.z);
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                void main() {
                    gl_FragColor = vec4(uColor, 0.4);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.wingTips = new THREE.Points(this.tipGeo, mat);
        this.wingTips.frustumCulled = false;
        this.scene.add(this.wingTips);
        
        // Initialize tip positions to hide them initially
        this.tipIndex = 0;
        for(let i=0; i<pos.length; i++) pos[i] = 0;
    }

    update(dt, player, camera) {
        this.updateScreenWind(dt, player, camera);
        this.updateWingTips(dt, player);
    }

    updateScreenWind(dt, player, camera) {
        if (!this.particles) return;

        const speed = player.velocity.length();
        const minS = CONFIG.PHYSICS.SPEED_FLY_MIN;
        const maxS = CONFIG.PHYSICS.SPEED_FLY_MAX;

        // Calculate opacity based on speed relative to fly limits
        let targetOpacity = 0;
        if (speed > minS) {
            const t = Math.max(0, Math.min(1, (speed - minS) / (maxS - minS)));
            targetOpacity = CONFIG.GRAPHICS.WIND.OPACITY_MIN + t * (CONFIG.GRAPHICS.WIND.OPACITY_MAX - CONFIG.GRAPHICS.WIND.OPACITY_MIN);
        }

        // OPTIMIZATION: Skip updates if barely visible
        if (targetOpacity < 0.05) {
            this.particles.material.uniforms.uOpacity.value = 0;
            this.particles.visible = false;
            return;
        }

        this.particles.visible = true;
        this.particles.material.uniforms.uOpacity.value = targetOpacity;

        // Move particles relative to camera
        // We simulate infinite scrolling by resetting Z
        const positions = this.particles.geometry.attributes.position.array;
        
        // Get camera basis
        const camPos = camera.position;
        const camRot = camera.rotation; // Euler
        
        this.particles.position.copy(camPos);
        this.particles.rotation.copy(camRot);
        
        const moveSpeed = speed * 2.0; // Visual speed multiplier

        for (let i = 0; i < this.count; i++) {
            // Z is moving positive (towards screen) in local space
            positions[i * 3 + 2] += moveSpeed * dt;

            // If passes camera (Z > 0), reset to far distance
            if (positions[i * 3 + 2] > 5) {
                positions[i * 3 + 2] = -50 - Math.random() * 20;
                
                // Randomize X/Y again for variety
                const angle = Math.random() * Math.PI * 2;
                const radius = 5 + Math.random() * 15;
                positions[i * 3] = Math.cos(angle) * radius;
                positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
            }
        }
        
        this.particles.geometry.attributes.position.needsUpdate = true;
    }

    updateWingTips(dt, player) {
        if (!this.wingTips) return;

        // Get world positions of wing tips
        // Left Wing Tip: approximate based on player hierarchy
        // Wing is 1.4 wide, translated -0.7. Tip is roughly -1.4 from pivot center
        
        if (player.leftWing && player.rightWing) {
            this.dummyVec.set(-1.4, 0, 0); 
            this.dummyVec.applyMatrix4(player.leftWingPivot.matrixWorld);
            this.tipPosLeft.copy(this.dummyVec);

            this.dummyVec.set(1.4, 0, 0);
            this.dummyVec.applyMatrix4(player.rightWingPivot.matrixWorld);
            this.tipPosRight.copy(this.dummyVec);
        }

        const positions = this.wingTips.geometry.attributes.position.array;
        const sizes = this.wingTips.geometry.attributes.size.array;

        // Update circular buffer
        const idx = this.tipIndex;
        
        positions[idx * 6 + 0] = this.tipPosLeft.x;
        positions[idx * 6 + 1] = this.tipPosLeft.y;
        positions[idx * 6 + 2] = this.tipPosLeft.z;
        
        positions[idx * 6 + 3] = this.tipPosRight.x;
        positions[idx * 6 + 4] = this.tipPosRight.y;
        positions[idx * 6 + 5] = this.tipPosRight.z;

        // Size logic: Large when new, small when old
        sizes[idx * 2] = 5.0; // Left
        sizes[idx * 2 + 1] = 5.0; // Right

        // Fade old particles
        for (let i = 0; i < this.tipCount; i++) {
            if (i === idx) continue;
            sizes[i * 2] *= 0.9;
            sizes[i * 2 + 1] *= 0.9;
        }

        this.tipIndex = (this.tipIndex + 1) % this.tipCount;

        this.wingTips.geometry.attributes.position.needsUpdate = true;
        this.wingTips.geometry.attributes.size.needsUpdate = true;
        
        // Hide trails if not flying fast
        const speed = player.velocity.length();
        this.wingTips.visible = (speed > CONFIG.PHYSICS.SPEED_FLY_MIN);
    }

    reset() {
        if (this.wingTips) {
             const sizes = this.wingTips.geometry.attributes.size.array;
             for(let i=0; i<sizes.length; i++) sizes[i] = 0;
             this.wingTips.geometry.attributes.size.needsUpdate = true;
        }
    }
}