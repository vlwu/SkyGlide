import * as THREE from 'three';

export const CONFIG = {
    WORLD: {
        CHUNK_SIZE: 16,
        CHUNK_HEIGHT: 96,
        RENDER_DISTANCE: 10,
        RENDER_DISTANCE_UNITS: 160,
        SAFE_RADIUS_SQ: 1600, 
        MAX_SHADOW_DIST: 30,
        SHADOW_DIST_SQ: 900, 
        LOD: {
            DIST_LOW: 4, 
            DIST_FAR: 7, 
        }
    },
    PHYSICS: {
        GRAVITY: 25.0,
        JUMP_FORCE: 11.0,
        SPEED_WALK: 10.0,
        SPEED_FLY_MIN: 15.0,
        SPEED_FLY_MAX: 35.0,
        FRICTION_DEFAULT: 10.0,
        ELYTRA: {
            GRAVITY: 32.0,
            LIFT_COEFF: 24.0,
            DIVE_ACCEL: 2.0,
            CLIMB_BOOST: 0.8,
            STEER_SPEED: 12.0,
            VERT_STEER_SPEED: 6.0,
            DRAG: 0.996
        }
    },
    PLAYER: {
        HEIGHT: 1.8,
        RADIUS: 0.3, 
        CAMERA: {
            FOV: 75,
            BASE_DIST: 6.0,
            OFFSET: new THREE.Vector3(0, 0.5, 0),
            COLLISION_STEP: 0.8
        }
    },
    GAME: {
        CEILING_LIMIT: 250,
        FLOOR_LIMIT: -30,
        CYCLE_DURATION: 300, 
        RINGS: {
            BUCKET_SIZE: 20, // Reduced from 50 to 20 for finer spatial hashing
            VISUAL_BUCKET_SIZE: 100,
            COLLISION_DIST_SQ: 30.25,
            RENDER_DIST: 200
        }
    },
    GRAPHICS: {
        SKY: {
            DAY_TOP: 0x4A6FA5,
            DAY_BOT: 0xA0D0E0,
            SET_TOP: 0x332255,
            SET_BOT: 0xFF6644,
            NIGHT_TOP: 0x020205,
            NIGHT_BOT: 0x111122,
            RISE_TOP: 0x224477,
            RISE_BOT: 0xFFCC33
        },
        FOG: {
            COLOR: 0xA0D0E0,
            NEAR: 100,
            FAR_OFFSET: 50
        },
        WIND: {
            COUNT: 50,
            COLOR: 0xffffff,
            OPACITY_MIN: 0.0,
            OPACITY_MAX: 0.2
        }
    }
};