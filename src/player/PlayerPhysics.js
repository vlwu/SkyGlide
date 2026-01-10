import * as THREE from 'three';

const BLOCK = {
    AIR: 0,
    GRASS: 1,
    STONE: 2,
    SPAWN: 3,
    DIRT: 4,
    SNOW: 5,
    SAND: 6,
    ICE: 7
};

export class PlayerPhysics {
    constructor(world) {
        this.world = world;
        
        this._forward = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._inputDir = new THREE.Vector3();
        this._lookDir = new THREE.Vector3();
        this._nextPos = new THREE.Vector3();
        this._tempVec = new THREE.Vector3();
        
        this.radius = 0.3;
    }

    update(dt, player) {
        // --- SAFETY CHECK ---
        const chunkX = Math.floor(player.position.x / 16);
        const chunkZ = Math.floor(player.position.z / 16);
        
        if (!this.world.hasChunk(chunkX, chunkZ)) {
            player.velocity.set(0, 0, 0);
            return;
        }

        this.checkGrounded(player);

        switch(player.state) {
            case 'WALKING': this.handleWalking(dt, player); break;
            case 'FALLING': this.handleFalling(dt, player); break;
            case 'FLYING': this.handleFlying(dt, player); break;
        }

        this.resolvePhysics(dt, player);
    }

    checkGrounded(player) {
        const feetY = player.position.y - 0.05;
        this._tempVec.set(player.position.x, feetY, player.position.z);
        
        const blockBelow = this.getWorldBlockInternal(this._tempVec.x, this._tempVec.y, this._tempVec.z);
        
        if (player.velocity.y <= 0 && blockBelow !== BLOCK.AIR) {
            player.onGround = true;
            player.groundBlock = blockBelow;
            if (player.state === 'FALLING') player.state = 'WALKING';
        } else {
            player.onGround = false;
            player.groundBlock = BLOCK.AIR;
        }
    }

    getWorldBlockInternal(x, y, z) {
        // Optimization: Fast integer lookup for center point
        // If center is solid, return it immediately.
        let val = this.world.getBlock(x, y, z);
        if (val) return val;

        const rx = x % 1; 
        const rz = z % 1;
        const buffer = this.radius;

        // Check X+
        if (rx > 1 - buffer) {
             if (val = this.world.getBlock(x + buffer, y, z)) return val;
        }
        // Check X-
        else if (rx < buffer) {
             if (val = this.world.getBlock(x - buffer, y, z)) return val;
        }
        
        // Check Z+
        if (rz > 1 - buffer) {
             if (val = this.world.getBlock(x, y, z + buffer)) return val;
        }
        // Check Z-
        else if (rz < buffer) {
             if (val = this.world.getBlock(x, y, z - buffer)) return val;
        }

        return 0;
    }

    handleWalking(dt, player) {
        let friction = 10.0;
        let moveSpeed = 10.0;

        if (player.groundBlock === BLOCK.ICE) {
            friction = 0.5;
            moveSpeed = 15.0;
        } else if (player.groundBlock === BLOCK.SAND) {
            friction = 15.0;
            moveSpeed = 7.0;
        } else if (player.groundBlock === BLOCK.SNOW) {
            friction = 8.0;
            moveSpeed = 9.0;
        }

        const jumpForce = 11;
        const gravity = 25;

        player.velocity.x -= player.velocity.x * friction * dt;
        player.velocity.z -= player.velocity.z * friction * dt;

        this._forward.set(Math.sin(player.yaw), 0, Math.cos(player.yaw)).normalize();
        this._right.set(Math.sin(player.yaw - Math.PI/2), 0, Math.cos(player.yaw - Math.PI/2)).normalize();
        
        this._inputDir.set(0,0,0);
        if (player.keys.forward) this._inputDir.add(this._forward);
        if (player.keys.backward) this._inputDir.sub(this._forward);
        if (player.keys.right) this._inputDir.add(this._right);
        if (player.keys.left) this._inputDir.sub(this._right);

        if (this._inputDir.lengthSq() > 0) this._inputDir.normalize();

        player.velocity.add(this._inputDir.multiplyScalar(moveSpeed * friction * dt));

        if (player.onGround) {
            player.velocity.y = 0;
            if (player.jumpPressedThisFrame) {
                player.velocity.y = jumpForce;
                player.onGround = false;
                player.position.y += 0.1; 
                player.state = 'FALLING'; 
            }
        } else {
            player.velocity.y -= gravity * dt;
            if (player.velocity.y < -1.0) player.state = 'FALLING';
        }
    }

    handleFalling(dt, player) {
        const gravity = 25;
        player.velocity.y -= gravity * dt;

        const airSpeed = 5;
        this._forward.set(Math.sin(player.yaw), 0, Math.cos(player.yaw)).normalize();
        if (player.keys.forward) player.velocity.add(this._forward.multiplyScalar(airSpeed * dt));

        if (player.jumpPressedThisFrame && !player.onGround) {
            player.state = 'FLYING';
            const speed = player.velocity.length();
            if (speed < 15) {
                this._lookDir.set(
                    Math.sin(player.yaw) * Math.cos(player.pitch),
                    Math.sin(player.pitch),
                    Math.cos(player.yaw) * Math.cos(player.pitch)
                );
                player.velocity.add(this._lookDir.multiplyScalar(15 - speed));
            }
        }
    }

    handleFlying(dt, player) {
        const stepSize = 0.05;
        let remaining = dt;
        let iterations = 0;
        
        while (remaining > 0 && iterations < 4) {
            const currentDt = Math.min(remaining, stepSize);
            this.simulateElytraPhysics(currentDt, player);
            remaining -= currentDt;
            iterations++;
        }

        if (player.velocity.length() < 1.0) {
            player.state = 'FALLING';
        }
    }

    simulateElytraPhysics(dt, player) {
        this._lookDir.set(
            Math.sin(player.yaw) * Math.cos(player.pitch),
            Math.sin(player.pitch),
            Math.cos(player.yaw) * Math.cos(player.pitch)
        ).normalize();
        
        const look = this._lookDir;
        const hlook = Math.sqrt(look.x * look.x + look.z * look.z); 
        const sqrpitchcos = hlook * hlook;

        const GRAVITY = 32.0;
        const LIFT_COEFF = 24.0; 
        const DIVE_ACCEL = 2.0; 
        const CLIMB_BOOST = 0.8;
        const STEER_SPEED = 12.0; 

        const lift = sqrpitchcos * LIFT_COEFF;
        player.velocity.y += (-GRAVITY + lift) * dt;

        const ticks = dt * 20;
        const dragXZ = Math.pow(0.996, ticks); 
        const dragY = Math.pow(0.996, ticks);

        player.velocity.x *= dragXZ;
        player.velocity.y *= dragY;
        player.velocity.z *= dragXZ;

        if (player.velocity.y < 0 && hlook > 0) {
            const diveForce = player.velocity.y * -DIVE_ACCEL * sqrpitchcos * dt;
            player.velocity.y += diveForce;
            player.velocity.x += (look.x / hlook) * diveForce;
            player.velocity.z += (look.z / hlook) * diveForce;
        }

        if (player.pitch > 0) {
            const hvel = Math.sqrt(player.velocity.x**2 + player.velocity.z**2);
            const climbForce = hvel * Math.sin(player.pitch) * CLIMB_BOOST * dt;
            
            player.velocity.y += climbForce * 3.5;
            player.velocity.x -= (look.x / hlook) * climbForce;
            player.velocity.z -= (look.z / hlook) * climbForce;
        }

        if (hlook > 0) {
            const hvel = Math.sqrt(player.velocity.x**2 + player.velocity.z**2);
            const targetX = (look.x / hlook) * hvel;
            const targetZ = (look.z / hlook) * hvel;

            player.velocity.x += (targetX - player.velocity.x) * STEER_SPEED * dt;
            player.velocity.z += (targetZ - player.velocity.z) * STEER_SPEED * dt;
        }

        const MAX_SPEED = 40.0;
        const speedSq = player.velocity.lengthSq();
        if (speedSq > MAX_SPEED * MAX_SPEED) {
            const scale = MAX_SPEED / Math.sqrt(speedSq);
            player.velocity.multiplyScalar(scale);
        }
    }

    resolvePhysics(dt, player) {
        // Resolve X
        this._nextPos.copy(player.position);
        this._nextPos.x += player.velocity.x * dt;
        if (this.checkCollisionBody(this._nextPos, player)) {
            player.velocity.x = 0;
            // Feature: Removed crash() call to allow wall sliding in FLYING state
        } else {
            player.position.x = this._nextPos.x;
        }

        // Resolve Z
        this._nextPos.copy(player.position);
        this._nextPos.z += player.velocity.z * dt;
        if (this.checkCollisionBody(this._nextPos, player)) {
            player.velocity.z = 0;
            // Feature: Removed crash() call to allow wall sliding in FLYING state
        } else {
            player.position.z = this._nextPos.z;
        }

        // Resolve Y
        this._nextPos.copy(player.position);
        this._nextPos.y += player.velocity.y * dt;
        
        if (Math.abs(player.velocity.y) > 0.001) {
            if (this.checkCollisionBody(this._nextPos, player)) {
                if (player.velocity.y < 0) {
                    // Landing on ground
                    player.position.y = Math.floor(this._nextPos.y + 0.1) + 1; 
                    player.velocity.y = 0;
                    player.onGround = true; 
                    if(player.state === 'FLYING' || player.state === 'FALLING') player.state = 'WALKING';
                } else {
                    // Hitting ceiling
                    player.position.y = Math.floor(this._nextPos.y) - 0.2; 
                    player.velocity.y = 0;
                }
            } else {
                player.position.y = this._nextPos.y;
            }
        }
    }

    checkCollisionBody(pos, player) {
        if(this.checkPoint(pos.x, pos.y + 0.1, pos.z)) return true;
        if(this.checkPoint(pos.x, pos.y + player.dims.height * 0.5, pos.z)) return true;
        if(this.checkPoint(pos.x, pos.y + player.dims.height - 0.1, pos.z)) return true;
        return false;
    }

    checkPoint(x, y, z) {
        return this.getWorldBlockInternal(x, y, z) !== 0;
    }

    crash(player) {
        player.state = 'FALLING';
        player.velocity.multiplyScalar(0.2);
    }
}