import * as THREE from 'three';
import { settingsManager } from './settings/SettingsManager.js';
import { PlayerCamera } from './player/PlayerCamera.js';
import { PlayerPhysics } from './player/PlayerPhysics.js';

export class Player {
    constructor(scene, camera, world) {
        this.scene = scene;
        this.world = world;

        // Components
        this.playerCamera = new PlayerCamera(camera, world);
        this.physics = new PlayerPhysics(world);

        // State
        this.state = 'WALKING';
        this.position = new THREE.Vector3(0, 16, 0); 
        this.velocity = new THREE.Vector3(0, 0, 0);
        
        this.pitch = 0; 
        this.yaw = Math.PI; 
        
        this.keys = {
            forward: false, backward: false,
            left: false, right: false,
            jump: false,
            reset: false
        };
        this.jumpPressedThisFrame = false; 
        this.resetPressedThisFrame = false;

        this.dims = { height: 1.8, radius: 0.4 }; 
        this.onGround = false;
        this.groundBlock = 0; 
        
        // --- Visual Representation ---
        const geometry = new THREE.CylinderGeometry(0.4, 0.4, 1.8, 8);
        const material = new THREE.MeshPhongMaterial({
            color: 0x00d2ff,        
            emissive: 0x0044aa,
            specular: 0xffffff,
            shininess: 30,
            opacity: 0.9,
            transparent: true      
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);

        this.initInput();
    }

    initInput() {
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement !== document.body) return;

            // --- BUG FIX: MOUSE JUMP ---
            // Reduced clamp threshold from 500 to 200.
            // When lag spikes occur, browsers can accumulate mouse deltas.
            // 200 is fast enough for gameplay but filters out frame-skip glitches.
            if (Math.abs(e.movementX) > 200 || Math.abs(e.movementY) > 200) return;

            const baseSensitivity = 0.002;
            const userSensitivity = settingsManager.get('sensitivity');
            const sensitivity = baseSensitivity * userSensitivity;

            this.yaw -= e.movementX * sensitivity;
            this.pitch -= e.movementY * sensitivity;
            this.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
        });

        const updateKey = (code, pressed) => {
            const keys = settingsManager.settings.keys;
            if (code === keys.forward) this.keys.forward = pressed;
            if (code === keys.backward) this.keys.backward = pressed;
            if (code === keys.left) this.keys.left = pressed;
            if (code === keys.right) this.keys.right = pressed;
            if (code === keys.jump) {
                if (pressed && !this.keys.jump) {
                    this.jumpPressedThisFrame = true;
                }
                this.keys.jump = pressed;
            }
            if (code === keys.reset) {
                if (pressed && !this.keys.reset) {
                    this.resetPressedThisFrame = true;
                }
                this.keys.reset = pressed;
            }
        };

        document.addEventListener('keydown', (e) => updateKey(e.code, true));
        document.addEventListener('keyup', (e) => updateKey(e.code, false));
    }

    reset() {
        this.position.set(0, 16, 0);
        this.velocity.set(0, 0, 0);
        this.pitch = 0;
        this.yaw = Math.PI;
        this.state = 'WALKING';
        this.onGround = false;
        this.groundBlock = 0;
        this.keys.reset = false;
        this.resetPressedThisFrame = false;
        
        this.playerCamera.reset();
    }

    consumeResetInput() {
        if (this.resetPressedThisFrame) {
            this.resetPressedThisFrame = false;
            return true;
        }
        return false;
    }

    update(dt) {
        this.physics.update(dt, this);
        this.jumpPressedThisFrame = false;
        this.playerCamera.update(dt, this);
    }

    applyBoost(speedIncrease) {
        if (this.state !== 'FLYING') {
            this.state = 'FLYING';
            this.position.y += speedIncrease > 30 ? 3.0 : 2.0;
        }

        const lookDir = new THREE.Vector3(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        ).normalize();

        this.velocity.add(lookDir.multiplyScalar(speedIncrease));
    }
}