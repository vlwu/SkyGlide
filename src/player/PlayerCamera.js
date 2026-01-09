import * as THREE from 'three';

export class PlayerCamera {
    constructor(camera, world) {
        this.camera = camera;
        this.world = world;
        this.baseFOV = camera.fov;
        
        // Temp vars to avoid GC
        this._lookDir = new THREE.Vector3();
        this._tempVec = new THREE.Vector3();
    }

    reset() {
        this.camera.fov = this.baseFOV;
        this.camera.updateProjectionMatrix();
    }

    update(dt, player) {
        // Player center position
        const centerPos = player.position.clone();
        centerPos.y += player.dims.height / 2;

        // Sync Mesh rotation (visuals)
        player.mesh.position.copy(centerPos);
        player.mesh.rotation.order = 'YXZ';
        player.mesh.rotation.y = player.yaw;

        if (player.state === 'FLYING') {
            player.mesh.rotation.x = player.pitch - (Math.PI / 2);
        } else {
            player.mesh.rotation.x = 0;
        }

        // --- Dynamic FOV ---
        const speed = player.velocity.length();
        let desiredFOV = this.baseFOV;
        
        if (player.state === 'FLYING') {
            const t = Math.max(0, Math.min(1, (speed - 20) / 60));
            desiredFOV = this.baseFOV + (t * 45); 
        }

        this.camera.fov += (desiredFOV - this.camera.fov) * 5.0 * dt;
        this.camera.updateProjectionMatrix();

        // Calculate look vector
        this._lookDir.set(
            Math.sin(player.yaw) * Math.cos(player.pitch),
            Math.sin(player.pitch),
            Math.cos(player.yaw) * Math.cos(player.pitch)
        ).normalize();

        const viewTarget = centerPos.clone().add(new THREE.Vector3(0, 0.5, 0));

        const baseDist = 6.0;
        const extraDist = (this.camera.fov - this.baseFOV) * 0.05; 
        const cameraDist = baseDist + extraDist;

        const idealPos = centerPos.clone()
            .sub(this._lookDir.clone().multiplyScalar(cameraDist));
        idealPos.y += 1.5;

        // Camera Collision Raycast
        const camDir = new THREE.Vector3().subVectors(idealPos, viewTarget);
        const maxDist = camDir.length();
        camDir.normalize();

        let actualDist = maxDist;
        const step = 0.2; 

        for (let d = 0; d <= maxDist; d += step) {
            this._tempVec.copy(viewTarget).addScaledVector(camDir, d);
            if (this.world.getBlock(this._tempVec.x, this._tempVec.y, this._tempVec.z)) {
                actualDist = Math.max(0.5, d - 0.2); 
                break;
            }
        }

        const finalPos = viewTarget.clone().addScaledVector(camDir, actualDist);
        this.camera.position.copy(finalPos);
        this.camera.lookAt(viewTarget);
    }
}