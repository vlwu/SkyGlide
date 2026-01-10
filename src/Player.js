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
        
        // --- Visual Representation (Falcon/Elytra Style) ---
        this.mesh = new THREE.Group();
        
        // Materials
        const matBody = new THREE.MeshPhongMaterial({ 
            color: 0x00d2ff, 
            emissive: 0x002244,
            shininess: 30,
            flatShading: true 
        });
        const matWing = new THREE.MeshPhongMaterial({ 
            color: 0x0088bb, 
            emissive: 0x001133,
            shininess: 10,
            side: THREE.DoubleSide,
            flatShading: true 
        });

        // 1. Body (Fuselage)
        const bodyGeo = new THREE.BoxGeometry(0.4, 0.2, 1.0);
        this.bodyPart = new THREE.Mesh(bodyGeo, matBody);
        this.bodyPart.castShadow = true;
        this.bodyPart.receiveShadow = true;
        this.mesh.add(this.bodyPart);

        // 2. Left Wing Pivot
        this.leftWingPivot = new THREE.Group();
        this.leftWingPivot.position.set(-0.2, 0, 0); // Attach to left side
        this.mesh.add(this.leftWingPivot);

        // Left Wing Geometry (Origin at x=0 for pivoting, extends -x)
        const lWingGeo = new THREE.BoxGeometry(1.4, 0.05, 0.6);
        lWingGeo.translate(-0.7, 0, 0.1); // Shift so pivot is at edge, slightly back
        
        this.leftWing = new THREE.Mesh(lWingGeo, matWing);
        this.leftWing.castShadow = true;
        this.leftWing.receiveShadow = true;
        this.leftWingPivot.add(this.leftWing);

        // 3. Right Wing Pivot
        this.rightWingPivot = new THREE.Group();
        this.rightWingPivot.position.set(0.2, 0, 0); // Attach to right side
        this.mesh.add(this.rightWingPivot);

        // Right Wing Geometry (Origin at x=0 for pivoting, extends +x)
        const rWingGeo = new THREE.BoxGeometry(1.4, 0.05, 0.6);
        rWingGeo.translate(0.7, 0, 0.1); 

        this.rightWing = new THREE.Mesh(rWingGeo, matWing);
        this.rightWing.castShadow = true;
        this.rightWing.receiveShadow = true;
        this.rightWingPivot.add(this.rightWing);

        this.scene.add(this.mesh);

        this.initInput();
    }

    initInput() {
        document.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement !== document.body) return;

            // Filter out large jumps caused by browser lag
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