import * as THREE from 'three';
import { PLAYER_CONFIG } from './config.js';

export class Player {
    constructor(scene) {
        this.scene = scene;
        this.mesh = new THREE.Group();
        this.playerModel = this._createPlayerModel();
        this.mesh.add(this.playerModel);
        this.scene.add(this.mesh);

        this.velocity = new THREE.Vector3(0, 0, 0);
        this.targetRotation = { x: 0, y: 0 };
        this.previousYaw = 0;
        this.gravity = new THREE.Vector3(0, PLAYER_CONFIG.GRAVITY, 0);

        // Pre-allocate objects for performance
        this._forwardVector = new THREE.Vector3();
        this._targetVelocity = new THREE.Vector3();
        this._tempVector = new THREE.Vector3();

        this.reset();
    }

    _createPlayerModel() {
        const playerGeometry = new THREE.OctahedronGeometry(0.5);
        const playerMaterial = new THREE.MeshPhysicalMaterial({
            metalness: 0.2,
            roughness: 0.1,
            transmission: 0.95,
            ior: 1.7,
            thickness: 0.8,
            transparent: true
        });
        const model = new THREE.Mesh(playerGeometry, playerMaterial);
        model.scale.set(2, 0.8, 1.2);
        model.rotation.x = Math.PI / 2;
        return model;
    }

    update() {
        const speed = this.velocity.length();

        // Update player rotation based on target
        const maxPitch = Math.PI / 2 - 0.1;
        this.targetRotation.x = Math.max(-maxPitch, Math.min(maxPitch, this.targetRotation.x));
        this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, this.targetRotation.x, 0.05);
        this.mesh.rotation.y = THREE.MathUtils.lerp(this.mesh.rotation.y, this.targetRotation.y, 0.05);

        // Calculate yaw delta for model rolling
        const yawDelta = this.mesh.rotation.y - this.previousYaw;
        this.previousYaw = this.mesh.rotation.y;

        // Apply roll and tumble to the visual model
        const rollSpeed = yawDelta * -8;
        const tumbleSpeed = this.velocity.y * -1.5;
        this.playerModel.rotateY(rollSpeed);
        this.playerModel.rotateX(tumbleSpeed);

        // Physics Calculation
        this._forwardVector.set(0, 0, -1).applyQuaternion(this.mesh.quaternion);

        // Apply forward thrust and gravity
        this._tempVector.copy(this._forwardVector).multiplyScalar(PLAYER_CONFIG.FORWARD_THRUST);
        this.velocity.add(this._tempVector);
        this.velocity.add(this.gravity);

        // Re-orient velocity towards player's direction (simulates aerodynamic control)
        this._targetVelocity.copy(this._forwardVector).multiplyScalar(speed);
        this.velocity.lerp(this._targetVelocity, 0.025);

        // Calculate and apply lift
        const diveAngle = this.mesh.rotation.x;
        const forwardSpeed = -this.velocity.clone().projectOnVector(this._forwardVector).z;
        const liftAmount = Math.max(0, 1.0 - Math.abs(diveAngle)) * PLAYER_CONFIG.LIFT_FORCE;
        this.velocity.y += liftAmount * Math.abs(forwardSpeed);

        // Apply drag
        this.velocity.multiplyScalar(PLAYER_CONFIG.DRAG);

        // Update position
        this.mesh.position.add(this.velocity);
        this.mesh.updateMatrixWorld(true);
    }

    reset() {
        this.mesh.position.set(0, 150, 0);
        this.mesh.rotation.set(0, 0, 0);
        this.playerModel.rotation.set(Math.PI / 2, 0, 0);

        this.velocity.set(0, 0, 0);
        this.targetRotation = { x: 0, y: 0 };
        this.previousYaw = 0;
        this.mesh.updateMatrixWorld(true);
    }
}