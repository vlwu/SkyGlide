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
        this.groundBlock = 0; // 0 = AIR
        
        // --- Visual Representation ---
        const geometry = new THREE.CapsuleGeometry(0.4, 1.0, 4, 8);
        const material = new THREE.MeshPhysicalMaterial({
            color: 0x88ccff,        
            metalness: 0.0,
            roughness: 0.15,        
            transmission: 1.0,      
            thickness: 1.5,         
            ior: 1.5,               
            opacity: 1.0,
            transparent: false      
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

            if (Math.abs(e.movementX) > 500 || Math.abs(e.movementY) > 500) return;

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
        // Physics component updates position, state, velocity based on inputs
        this.physics.update(dt, this);
        
        // Reset per-frame flags
        this.jumpPressedThisFrame = false;

        // Camera component follows player
        this.playerCamera.update(dt, this);
    }

    applyBoost(speedIncrease) {
        if (this.state !== 'FLYING') {
            this.state = 'FLYING';
            this.position.y += 2.0;
        }

        const lookDir = new THREE.Vector3(
            Math.sin(this.yaw) * Math.cos(this.pitch),
            Math.sin(this.pitch),
            Math.cos(this.yaw) * Math.cos(this.pitch)
        ).normalize();

        this.velocity.add(lookDir.multiplyScalar(speedIncrease));
    }
}