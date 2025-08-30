export const PLAYER_CONFIG = {
    LIFT_FORCE: 0.005,
    FORWARD_THRUST: 0.013,
    GRAVITY: -0.003,
    DRAG: 0.99,
    GROUND_EFFECT_DISTANCE: 10,
    GROUND_EFFECT_STRENGTH: 0.0015,
};

export const CAMERA_CONFIG = {
    BASE_FOV: 75,
    SPEED_FOV_FACTOR: 15,
    BASE_Z_OFFSET: 6.0,
    SPEED_Z_OFFSET_FACTOR: 30,
    MAX_SPEED_Z_OFFSET: 6,
    Y_OFFSET: 2.5,
    LOOK_AT_Y_OFFSET: 1.0,
    POSITION_LERP: 0.08,
    QUATERNION_SLERP: 0.06,
    ROLL_FACTOR: -2.0,
};

export const SCENE_CONFIG = {
    FOG_COLOR: 0x87ceeb,
    FOG_NEAR: 200,
    FOG_FAR: 800,
    HEMISPHERE_LIGHT_INTENSITY: 0.6,
    DIRECTIONAL_LIGHT_INTENSITY: 1.0,
    MIN_HEMISPHERE_INTENSITY: 0.1,
    MOONLIGHT_INTENSITY: 0.15,
};

export const AIRSTREAM_CONFIG = {
    SEGMENTS: 20,
    WIDTH: 0.12,
    MIN_OPACITY: 0.05,
    MAX_OPACITY: 0.35,
    OPACITY_SPEED_FACTOR: 1.0,
};

export const SKY_CONFIG = {
    TURBIDITY: 10,
    RAYLEIGH: 3,
    MIE_COEFFICIENT: 0.005,
    MIE_DIRECTIONAL_G: 0.8,
    ELEVATION: 5,
    AZIMUTH: 180,
    DAY_DURATION_SECONDS: 120,
};

export const HOOP_CONFIG = {
    RADIUS: 5,
    TUBE_RADIUS: 0.3,
    SEGMENTS: 16,
    PATH_NODES: 20, // Number of hoops in a single path segment
    NODE_DISTANCE: 40, // Distance between hoops
    GENERATION_THRESHOLD: 10, // Generate new path when player is this many hoops away from the end
    SPEED_BOOST: 0.05,
    SCORE_BONUS: 100,
    COLOR: 0x00ffff,
    EMISSIVE_COLOR: 0x00ffff,
    PATH_JITTER_SCALE: 0.02, // how windy the path is
    PATH_START_HEIGHT: 100,
};