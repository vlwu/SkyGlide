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


        const maxPitch = Math.PI / 2 - 0.1;
        this.targetRotation.x = Math.max(-maxPitch, Math.min(maxPitch, this.targetRotation.x));
        this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, this.targetRotation.x, 0.05);
        this.mesh.rotation.y = THREE.MathUtils.lerp(this.mesh.rotation.y, this.targetRotation.y, 0.05);


        const yawDelta = this.mesh.rotation.y - this.previousYaw;
        this.previousYaw = this.mesh.rotation.y;


        const rollSpeed = yawDelta * -8;
        const tumbleSpeed = this.velocity.y * -1.5;
        this.playerModel.rotateY(rollSpeed);
        this.playerModel.rotateX(tumbleSpeed);


        this._forwardVector.set(0, 0, -1).applyQuaternion(this.mesh.quaternion);


        this._tempVector.copy(this._forwardVector).multiplyScalar(PLAYER_CONFIG.FORWARD_THRUST);
        this.velocity.add(this._tempVector);
        this.velocity.add(this.gravity);


        this._targetVelocity.copy(this._forwardVector).multiplyScalar(speed);
        this.velocity.lerp(this._targetVelocity, 0.025);


        const diveAngle = this.mesh.rotation.x;
        const forwardSpeed = -this.velocity.clone().projectOnVector(this._forwardVector).z;
        const liftAmount = Math.max(0, 1.0 - Math.abs(diveAngle)) * PLAYER_CONFIG.LIFT_FORCE;
        this.velocity.y += liftAmount * Math.abs(forwardSpeed);


        this.velocity.multiplyScalar(PLAYER_CONFIG.DRAG);


        this.mesh.position.add(this.velocity);
        this.mesh.updateMatrixWorld(true);
    }

    applyBoost(boostStrength) {
        this._forwardVector.set(0, 0, -1).applyQuaternion(this.mesh.quaternion);
        this.velocity.add(this._forwardVector.multiplyScalar(boostStrength));
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