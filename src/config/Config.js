import * as THREE from 'three';

export const CONFIG = {
    WORLD: {
        CHUNK_SIZE: 16,
        CHUNK_HEIGHT: 256, // Increased for verticality
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
        SPEED_FLY_MAX: 35.0, // Base max speed (without boost)
        SPEED_BOOST_CAP: 60.0, // Absolute max speed while boosting
        FRICTION_DEFAULT: 10.0,
        
        // Active Ability Specs
        BOOST: {
            FORCE: 30.0, // Acceleration added
            COST: 40.0, // Energy per second
            FOV_ADD: 15  // Extra FOV when boosting
        },
        BRAKE: {
            DRAG_MULT: 0.85, // Stronger velocity decay (was 0.96)
            TURN_MULT: 3.0,  // Tighter turning radius (was 2.5)
            MIN_SPEED: 10.0  // Don't stall completely
        },

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
        MAX_ENERGY: 100,
        ENERGY_GAIN: {
            RING: 25.0,
            PROXIMITY: 20.0 // Per second
        },
        CAMERA: {
            FOV: 75,
            BASE_DIST: 6.0,
            OFFSET: new THREE.Vector3(0, 0.5, 0),
            COLLISION_STEP: 0.8
        }
    },
    GAME: {
        CEILING_LIMIT: 320, // Raised ceiling
        FLOOR_LIMIT: -30,
        CYCLE_DURATION: 300, 
        PROXIMITY: {
            DIST: 3.5, // Blocks distance to trigger
            SCORE_RATE: 100 // Points per second
        },
        RINGS: {
            BUCKET_SIZE: 20, 
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