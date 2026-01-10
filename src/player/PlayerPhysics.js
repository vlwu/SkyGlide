import * as THREE from 'three';
import { CONFIG } from '../config/Config.js';
import { BLOCK } from '../world/BlockDefs.js';

export class PlayerPhysics {
    constructor(world) {
        this.world = world;
        
        this._forward = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._inputDir = new THREE.Vector3();
        this._lookDir = new THREE.Vector3();
        this._nextPos = new THREE.Vector3();
        this._tempVec = new THREE.Vector3();
        
        this.radius = CONFIG.PLAYER.RADIUS;
    }

    update(dt, player) {
        // --- SAFETY CHECK ---
        const chunkX = Math.floor(player.position.x / CONFIG.WORLD.CHUNK_SIZE);
        const chunkZ = Math.floor(player.position.z / CONFIG.WORLD.CHUNK_SIZE);
        
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
        let val = this.world.getBlock(x, y, z);
        if (val) return val;

        const rx = x % 1; 
        const rz = z % 1;
        const buffer = this.radius;

        if (rx > 1 - buffer) {
             if (val = this.world.getBlock(x + buffer, y, z)) return val;
        }
        else if (rx < buffer) {
             if (val = this.world.getBlock(x - buffer, y, z)) return val;
        }
        
        if (rz > 1 - buffer) {
             if (val = this.world.getBlock(x, y, z + buffer)) return val;
        }
        else if (rz < buffer) {
             if (val = this.world.getBlock(x, y, z - buffer)) return val;
        }

        return 0;
    }

    handleWalking(dt, player) {
        let friction = CONFIG.PHYSICS.FRICTION_DEFAULT;
        let moveSpeed = CONFIG.PHYSICS.SPEED_WALK;

        switch(player.groundBlock) {
            case BLOCK.ICE:
            case BLOCK.PACKED_ICE:
                friction = 0.5; moveSpeed = 15.0; break;
            case BLOCK.SAND:
                friction = 15.0; moveSpeed = 7.0; break;
            case BLOCK.SNOW:
                friction = 8.0; moveSpeed = 9.0; break;
            case BLOCK.GRAVEL:
                friction = 12.0; moveSpeed = 8.5; break;
            case BLOCK.CLAY:
                friction = 14.0; moveSpeed = 7.5; break;
            case BLOCK.MARBLE:
            case BLOCK.BASALT:
            case BLOCK.OBSIDIAN: // Fallback safety
                friction = 8.0; moveSpeed = 11.0; break;
            case BLOCK.MOSS_STONE:
                friction = 11.0; moveSpeed = 9.5; break;
        }

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

        // Use addScaledVector to avoid creating new Vector3s via multiplyScalar
        player.velocity.addScaledVector(this._inputDir, moveSpeed * friction * dt);

        if (player.onGround) {
            player.velocity.y = 0;
            if (player.jumpPressedThisFrame) {
                player.velocity.y = CONFIG.PHYSICS.JUMP_FORCE;
                player.onGround = false;
                player.position.y += 0.1; 
                player.state = 'FALLING'; 
            }
        } else {
            player.velocity.y -= CONFIG.PHYSICS.GRAVITY * dt;
            if (player.velocity.y < -1.0) player.state = 'FALLING';
        }
    }

    handleFalling(dt, player) {
        player.velocity.y -= CONFIG.PHYSICS.GRAVITY * dt;

        const airSpeed = 5;
        this._forward.set(Math.sin(player.yaw), 0, Math.cos(player.yaw)).normalize();
        
        if (player.keys.forward) {
            player.velocity.addScaledVector(this._forward, airSpeed * dt);
        }

        if (player.jumpPressedThisFrame && !player.onGround) {
            player.state = 'FLYING';
            const speed = player.velocity.length();
            if (speed < CONFIG.PHYSICS.SPEED_FLY_MIN) {
                this._lookDir.set(
                    Math.sin(player.yaw) * Math.cos(player.pitch),
                    Math.sin(player.pitch),
                    Math.cos(player.yaw) * Math.cos(player.pitch)
                );
                player.velocity.addScaledVector(this._lookDir, CONFIG.PHYSICS.SPEED_FLY_MIN - speed);
            }
        }
    }

    handleFlying(dt, player) {
        const stepSize = 0.1; // Larger timestep
        let remaining = dt;
        let iterations = 0;
        
        while (remaining > 0 && iterations < 2) {
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

        const E = CONFIG.PHYSICS.ELYTRA;

        const lift = sqrpitchcos * E.LIFT_COEFF;
        player.velocity.y += (-E.GRAVITY + lift) * dt;

        const ticks = dt * 20;
        const dragXZ = Math.pow(E.DRAG, ticks); 
        const dragY = Math.pow(E.DRAG, ticks);

        player.velocity.x *= dragXZ;
        player.velocity.y *= dragY;
        player.velocity.z *= dragXZ;

        if (player.velocity.y < 0 && hlook > 0) {
            const diveForce = player.velocity.y * -E.DIVE_ACCEL * sqrpitchcos * dt;
            player.velocity.y += diveForce;
            player.velocity.x += (look.x / hlook) * diveForce;
            player.velocity.z += (look.z / hlook) * diveForce;
        }

        if (player.pitch > 0) {
            const hvel = Math.sqrt(player.velocity.x**2 + player.velocity.z**2);
            const climbForce = hvel * Math.sin(player.pitch) * E.CLIMB_BOOST * dt;
            
            player.velocity.y += climbForce * 3.5;
            player.velocity.x -= (look.x / hlook) * climbForce;
            player.velocity.z -= (look.z / hlook) * climbForce;
        }

        if (hlook > 0) {
            const hvel = Math.sqrt(player.velocity.x**2 + player.velocity.z**2);
            const targetX = (look.x / hlook) * hvel;
            const targetZ = (look.z / hlook) * hvel;

            player.velocity.x += (targetX - player.velocity.x) * E.STEER_SPEED * dt;
            player.velocity.z += (targetZ - player.velocity.z) * E.STEER_SPEED * dt;
        }

        const speed = player.velocity.length();
        const targetY = speed * look.y;
        player.velocity.y += (targetY - player.velocity.y) * E.VERT_STEER_SPEED * dt;

        const speedSq = player.velocity.lengthSq();
        if (speedSq > CONFIG.PHYSICS.SPEED_FLY_MAX ** 2) {
            const scale = CONFIG.PHYSICS.SPEED_FLY_MAX / Math.sqrt(speedSq);
            player.velocity.multiplyScalar(scale);
        }
    }

    resolvePhysics(dt, player) {
        // Resolve X
        this._nextPos.copy(player.position);
        this._nextPos.x += player.velocity.x * dt;
        if (this.checkCollisionBody(this._nextPos, player)) {
            player.velocity.x = 0;
        } else {
            player.position.x = this._nextPos.x;
        }

        // Resolve Z
        this._nextPos.copy(player.position);
        this._nextPos.z += player.velocity.z * dt;
        if (this.checkCollisionBody(this._nextPos, player)) {
            player.velocity.z = 0;
        } else {
            player.position.z = this._nextPos.z;
        }

        // Resolve Y
        this._nextPos.copy(player.position);
        this._nextPos.y += player.velocity.y * dt;
        
        if (Math.abs(player.velocity.y) > 0.001) {
            if (this.checkCollisionBody(this._nextPos, player)) {
                if (player.velocity.y < 0) {
                    player.position.y = Math.floor(this._nextPos.y + 0.1) + 1; 
                    player.velocity.y = 0;
                    player.onGround = true; 

                    // Update groundBlock immediately for precise logic in main loop
                    this._tempVec.set(player.position.x, player.position.y - 0.05, player.position.z);
                    player.groundBlock = this.getWorldBlockInternal(this._tempVec.x, this._tempVec.y, this._tempVec.z);

                    if(player.state === 'FLYING' || player.state === 'FALLING') player.state = 'WALKING';
                } else {
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
}