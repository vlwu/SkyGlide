import * as THREE from 'three';

export class PlayerCamera {
    constructor(camera, world) {
        this.camera = camera;
        this.world = world;
        this.baseFOV = camera.fov;
        
        // Memory Optimization: Pre-allocate all vectors used in calculations
        // to absolutely zero out Garbage Collection (GC) during gameplay.
        this._lookDir = new THREE.Vector3();
        this._tempVec = new THREE.Vector3();
        this._centerPos = new THREE.Vector3();
        this._viewTarget = new THREE.Vector3();
        this._idealPos = new THREE.Vector3();
        this._camDir = new THREE.Vector3();
        this._viewOffset = new THREE.Vector3(0, 0.5, 0); // Constant offset
    }

    reset() {
        this.camera.fov = this.baseFOV;
        this.camera.updateProjectionMatrix();
    }

    update(dt, player) {
        // 1. Calculate Player Center (No allocation)
        this._centerPos.copy(player.position);
        this._centerPos.y += player.dims.height / 2;

        // 2. Sync Mesh visuals
        player.mesh.position.copy(this._centerPos);
        player.mesh.rotation.order = 'YXZ';
        player.mesh.rotation.y = player.yaw;

        if (player.state === 'FLYING') {
            player.mesh.rotation.x = player.pitch - (Math.PI / 2);
        } else {
            player.mesh.rotation.x = 0;
        }

        // 3. Dynamic FOV
        const speed = player.velocity.length();
        let desiredFOV = this.baseFOV;
        
        if (player.state === 'FLYING') {
            // Speed adjusted for new cap (15 to 40 range)
            const t = Math.max(0, Math.min(1, (speed - 15) / 25));
            desiredFOV = this.baseFOV + (t * 35); 
        }

        this.camera.fov += (desiredFOV - this.camera.fov) * 5.0 * dt;
        this.camera.updateProjectionMatrix();

        // 4. Calculate Look Vector
        this._lookDir.set(
            Math.sin(player.yaw) * Math.cos(player.pitch),
            Math.sin(player.pitch),
            Math.cos(player.yaw) * Math.cos(player.pitch)
        ).normalize();

        // 5. Calculate Camera Positions (No cloning)
        // View Target = Center + Offset
        this._viewTarget.copy(this._centerPos).add(this._viewOffset);

        const baseDist = 6.0;
        const extraDist = (this.camera.fov - this.baseFOV) * 0.05; 
        const cameraDist = baseDist + extraDist;

        // Ideal Pos calculation
        this._idealPos.copy(this._centerPos).sub(this._lookDir.multiplyScalar(cameraDist));
        this._idealPos.y += 1.5;

        // 6. Camera Collision Raycast
        // camDir = Ideal - Target
        this._camDir.subVectors(this._idealPos, this._viewTarget);
        const maxDist = this._camDir.length();
        this._camDir.normalize();

        let actualDist = maxDist;
        // Optimization: Increased step size to 0.8 reduces raycast iterations significantly
        // while maintaining acceptable camera collision precision.
        const step = 0.8; 

        for (let d = 0; d <= maxDist; d += step) {
            this._tempVec.copy(this._viewTarget).addScaledVector(this._camDir, d);
            // Integer check is faster than precise float check if valid
            if (this.world.getBlock(this._tempVec.x, this._tempVec.y, this._tempVec.z)) {
                actualDist = Math.max(0.5, d - 0.2); 
                break;
            }
        }

        // Final Position
        this._tempVec.copy(this._viewTarget).addScaledVector(this._camDir, actualDist);
        this.camera.position.copy(this._tempVec);
        this.camera.lookAt(this._viewTarget);
    }
}