import * as THREE from 'three';
import { World } from './World.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Player } from './Player.js';
import { UIManager } from './UIManager.js';
import { InputManager } from './InputManager.js';
import { CAMERA_CONFIG, SCENE_CONFIG, AIRSTREAM_CONFIG, SKY_CONFIG } from './config.js';

let scene, camera, renderer, player, world, raycaster, sky, sun, directionIndicator, starField, hemisphereLight, directionalLight, uiManager, inputManager;
let airStreams = [];
const STREAM_SEGMENTS = AIRSTREAM_CONFIG.SEGMENTS;
const STREAM_WIDTH = AIRSTREAM_CONFIG.WIDTH;

let isGameOver = false;
let isPaused = false;
let score = 0;
let highScore = 0;
let clock;

const skyEffectController = {
    turbidity: SKY_CONFIG.TURBIDITY,
    rayleigh: SKY_CONFIG.RAYLEIGH,
    mieCoefficient: SKY_CONFIG.MIE_COEFFICIENT,
    mieDirectionalG: SKY_CONFIG.MIE_DIRECTIONAL_G,
    elevation: SKY_CONFIG.ELEVATION,
    azimuth: SKY_CONFIG.AZIMUTH,
};

function init() {
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(SCENE_CONFIG.FOG_COLOR, SCENE_CONFIG.FOG_NEAR, SCENE_CONFIG.FOG_FAR);
    clock = new THREE.Clock();

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.45;
    document.getElementById('game-container').appendChild(renderer.domElement);

    setupScene();
    setupAirStreams();

    player = new Player(scene);
    world = new World(scene);
    raycaster = new THREE.Raycaster();
    camera.lookAt(player.mesh.position);

    const gameActions = {
        onStartGame: startGame,
        onRestartGame: restartGame,
        onTogglePause: togglePause,
        onToggleFullscreen: toggleFullscreen,
        onPointerLockChange: onPointerLockChange,
        onSettingChange: handleSettingChange,
        isPaused: () => isPaused,
        isGameOver: () => isGameOver,
        isSettingsOpen: () => document.getElementById('settings-overlay').style.opacity === '1',
        toggleSettings: (visible) => uiManager.showSettings(visible),
    };

    uiManager = new UIManager(gameActions);
    inputManager = new InputManager(player, gameActions);

    loadSettings();
    highScore = parseInt(localStorage.getItem('highScore') || '0');
    uiManager.updateHighScore(highScore);

    animate();
}

function setupScene() {
    sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);

    sun = new THREE.Vector3();
    const uniforms = sky.material.uniforms;
    uniforms['turbidity'].value = skyEffectController.turbidity;
    uniforms['rayleigh'].value = skyEffectController.rayleigh;
    uniforms['mieCoefficient'].value = skyEffectController.mieCoefficient;
    uniforms['mieDirectionalG'].value = skyEffectController.mieDirectionalG;

    const phi = THREE.MathUtils.degToRad(90 - skyEffectController.elevation);
    const theta = THREE.MathUtils.degToRad(skyEffectController.azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    uniforms['sunPosition'].value.copy(sun);

    hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x4caf50, SCENE_CONFIG.HEMISPHERE_LIGHT_INTENSITY);
    scene.add(hemisphereLight);
    directionalLight = new THREE.DirectionalLight(0xffffff, SCENE_CONFIG.DIRECTIONAL_LIGHT_INTENSITY);
    directionalLight.position.copy(sun).multiplyScalar(50);
    scene.add(directionalLight);

    const starVertices = [];
    for (let i = 0; i < 10000; i++) starVertices.push(THREE.MathUtils.randFloatSpread(2000), THREE.MathUtils.randFloatSpread(2000), THREE.MathUtils.randFloatSpread(2000));
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, transparent: true, opacity: 0 });
    starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);

    const indicatorGeometry = new THREE.SphereGeometry(0.15, 8, 8);
    const indicatorMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
    directionIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    directionIndicator.visible = false;
    scene.add(directionIndicator);
}

function setupAirStreams() {
    const streamOrigins = [new THREE.Vector3(0.5, 0, -0.1), new THREE.Vector3(-0.5, 0, -0.1)];
    streamOrigins.forEach(vertex => {
        const points = Array.from({ length: STREAM_SEGMENTS }, () => new THREE.Vector3());
        const streamGeometry = new THREE.BufferGeometry();
        streamGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAM_SEGMENTS * 2 * 3), 3));
        streamGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(STREAM_SEGMENTS * 2 * 3), 3));
        const indices = [];
        for (let i = 0; i < STREAM_SEGMENTS - 1; i++) {
            const p1 = i * 2, p2 = p1 + 1, p3 = p1 + 2, p4 = p1 + 3;
            indices.push(p1, p2, p3, p2, p4, p3);
        }
        streamGeometry.setIndex(indices);
        const streamMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.FrontSide, opacity: 0.5 });
        const streamMesh = new THREE.Mesh(streamGeometry, streamMaterial);
        streamMesh.frustumCulled = false;
        airStreams.push({ mesh: streamMesh, origin: vertex.clone(), points: points, material: streamMaterial });
        scene.add(streamMesh);
    });
}

function loadSettings() {
    const settings = {
        invertMousePitch: localStorage.getItem('invertMousePitch') === 'true',
        mouseSensitivity: parseFloat(localStorage.getItem('mouseSensitivity') || '1.0'),
    };
    uiManager.setInitialSettings(settings);
    inputManager.updateSettings('invertMousePitch', settings.invertMousePitch);
    inputManager.updateSettings('mouseSensitivity', settings.mouseSensitivity);
}

function handleSettingChange(key, value) {
    localStorage.setItem(key, value);
    inputManager.updateSettings(key, value);
}

function startGame() {
    uiManager.showIntro(false);
    uiManager.requestPointerLock();
    directionIndicator.visible = true;
}

function onPointerLockChange() {
    if (document.pointerLockElement === null && !isGameOver && !isPaused) {
        togglePause();
    }
}

function togglePause() {
    if (isGameOver) return;
    isPaused = !isPaused;
    uiManager.showPause(isPaused, score);
    if (isPaused) {
        document.exitPointerLock();
        directionIndicator.visible = false;
    } else {
        uiManager.requestPointerLock();
        directionIndicator.visible = true;
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(err => console.error(err));
    else if (document.exitFullscreen) document.exitFullscreen();
}

function handleCollision() {
    isGameOver = true;
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('highScore', highScore);
        uiManager.updateHighScore(highScore);
    }
    uiManager.showGameOver(true, score, highScore);
    document.exitPointerLock();
    directionIndicator.visible = false;
}

function restartGame() {
    isGameOver = false;
    player.reset();
    airStreams.forEach(stream => {
        const initialWorldPos = stream.origin.clone().applyMatrix4(player.playerModel.matrixWorld);
        for (let i = 0; i < STREAM_SEGMENTS; i++) stream.points[i].copy(initialWorldPos);
        updateAirStreams();
    });
    world.reset();
    score = 0;
    uiManager.showGameOver(false);
    directionIndicator.visible = true;
    uiManager.requestPointerLock();
}

function updateTerrainInteraction() {
    const terrainMeshes = world.getActiveTerrainMeshes();
    if (terrainMeshes.length === 0) return;
    raycaster.set(player.mesh.position, new THREE.Vector3(0, -1, 0));
    const intersects = raycaster.intersectObjects(terrainMeshes);
    if (intersects.length > 0) {
        const distanceToGround = intersects[0].distance;
        if (distanceToGround < 1.0) handleCollision();
        else if (distanceToGround < PLAYER_CONFIG.GROUND_EFFECT_DISTANCE) {
            const groundEffect = (1 - (distanceToGround / PLAYER_CONFIG.GROUND_EFFECT_DISTANCE)) * PLAYER_CONFIG.GROUND_EFFECT_STRENGTH;
            player.velocity.y += groundEffect;
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (!isGameOver && !isPaused) {
        update();
    }
    renderer.render(scene, camera);
}

function updateAirStreams() {
    const speed = player.velocity.length();
    const opacity = THREE.MathUtils.clamp(speed * AIRSTREAM_CONFIG.OPACITY_SPEED_FACTOR, AIRSTREAM_CONFIG.MIN_OPACITY, AIRSTREAM_CONFIG.MAX_OPACITY);
    const upVector = new THREE.Vector3(0, 1, 0).applyQuaternion(player.playerModel.quaternion);
    const startColor = new THREE.Color(0.9, 0.95, 1.0);
    const endColor = new THREE.Color(0.5, 0.7, 1.0);

    airStreams.forEach(stream => {
        const currentWorldPos = stream.origin.clone().applyMatrix4(player.playerModel.matrixWorld);
        for (let i = STREAM_SEGMENTS - 1; i > 0; i--) stream.points[i].copy(stream.points[i - 1]);
        stream.points[0].copy(currentWorldPos);

        const positions = stream.mesh.geometry.attributes.position.array;
        const colors = stream.mesh.geometry.attributes.color.array;
        for (let i = 0; i < STREAM_SEGMENTS; i++) {
            const point = stream.points[i];
            const ribbonUp = upVector.clone().multiplyScalar(STREAM_WIDTH / 2);
            const p1 = point.clone().add(ribbonUp), p2 = point.clone().sub(ribbonUp);
            positions[i * 6 + 0] = p1.x; positions[i * 6 + 1] = p1.y; positions[i * 6 + 2] = p1.z;
            positions[i * 6 + 3] = p2.x; positions[i * 6 + 4] = p2.y; positions[i * 6 + 5] = p2.z;
            const alpha = i / (STREAM_SEGMENTS - 1);
            const currentColor = new THREE.Color().lerpColors(startColor, endColor, alpha);
            colors[i * 6 + 0] = currentColor.r; colors[i * 6 + 1] = currentColor.g; colors[i * 6 + 2] = currentColor.b;
            colors[i * 6 + 3] = currentColor.r; colors[i * 6 + 4] = currentColor.g; colors[i * 6 + 5] = currentColor.b;
        }
        stream.mesh.geometry.attributes.position.needsUpdate = true;
        stream.mesh.geometry.attributes.color.needsUpdate = true;
        stream.material.opacity = opacity;
    });
}

function updateDynamicSky(elapsedTime) {
    const uniforms = sky.material.uniforms;
    const time = (elapsedTime % SKY_CONFIG.DAY_DURATION_SECONDS) / SKY_CONFIG.DAY_DURATION_SECONDS;
    skyEffectController.elevation = -90 * Math.cos(time * Math.PI * 2) + 0.1;
    const visualElevation = Math.max(skyEffectController.elevation, -5);
    const phi = THREE.MathUtils.degToRad(90 - visualElevation);
    const theta = THREE.MathUtils.degToRad(skyEffectController.azimuth);
    sun.setFromSphericalCoords(1, phi, theta);
    uniforms['sunPosition'].value.copy(sun);

    const isSunset = skyEffectController.elevation >= -5 && skyEffectController.elevation <= 10;
    const isDay = skyEffectController.elevation > 10;
    let targetRayleigh, targetTurbidity, targetExposure, targetFogColor, targetLightColor;

    if (isSunset) {
        const sunsetFactor = 1 - (skyEffectController.elevation + 5) / 15;
        targetRayleigh = THREE.MathUtils.lerp(3.5, 20, sunsetFactor);
        targetTurbidity = THREE.MathUtils.lerp(8, 15, sunsetFactor);
        targetExposure = THREE.MathUtils.lerp(0.45, 0.4, sunsetFactor);
        targetFogColor = new THREE.Color(0xe88e3c);
        targetLightColor = new THREE.Color(0xffaa55);
    } else if (isDay) {
        targetRayleigh = 3.5; targetTurbidity = 8; targetExposure = 0.45;
        targetFogColor = new THREE.Color(0x87ceeb); targetLightColor = new THREE.Color(0xffffff);
    } else {
        targetRayleigh = 0.1; targetTurbidity = 1; targetExposure = 0.15;
        targetFogColor = new THREE.Color(0x0a101a); targetLightColor = new THREE.Color(0xffffff);
    }

    const lerpSpeed = 0.05;
    uniforms['rayleigh'].value = THREE.MathUtils.lerp(uniforms['rayleigh'].value, targetRayleigh, lerpSpeed);
    uniforms['turbidity'].value = THREE.MathUtils.lerp(uniforms['turbidity'].value, targetTurbidity, lerpSpeed);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(renderer.toneMappingExposure, targetExposure, lerpSpeed);
    scene.fog.color.lerp(targetFogColor, lerpSpeed);
    const lightIntensity = Math.max(0, skyEffectController.elevation) / 90;
    directionalLight.intensity = lightIntensity * SCENE_CONFIG.DIRECTIONAL_LIGHT_INTENSITY;
    directionalLight.color.lerp(targetLightColor, lerpSpeed);
    hemisphereLight.intensity = lightIntensity * SCENE_CONFIG.HEMISPHERE_LIGHT_INTENSITY;
    hemisphereLight.color.lerp(targetFogColor, lerpSpeed);
    const starOpacity = THREE.MathUtils.clamp(1.0 - (skyEffectController.elevation + 5) / 10, 0, 1);
    starField.material.opacity = THREE.MathUtils.lerp(starField.material.opacity, starOpacity, lerpSpeed);
    starField.position.copy(player.mesh.position);
}

function update() {
    const elapsedTime = clock.getElapsedTime();
    const speed = player.velocity.length();

    player.update();
    world.update(player.mesh.position);
    updateDynamicSky(elapsedTime);

    const yawDelta = player.mesh.rotation.y - player.previousYaw;

    const dynamicZOffset = Math.min(speed * CAMERA_CONFIG.SPEED_Z_OFFSET_FACTOR, CAMERA_CONFIG.MAX_SPEED_Z_OFFSET);
    const cameraOffset = new THREE.Vector3(CAMERA_CONFIG.X_OFFSET, CAMERA_CONFIG.Y_OFFSET, CAMERA_CONFIG.BASE_Z_OFFSET + dynamicZOffset);
    cameraOffset.applyQuaternion(player.mesh.quaternion);
    const targetCameraPosition = player.mesh.position.clone().add(cameraOffset);
    camera.position.lerp(targetCameraPosition, CAMERA_CONFIG.POSITION_LERP);

    const lookAtPosition = player.mesh.position.clone().add(new THREE.Vector3(0, CAMERA_CONFIG.LOOK_AT_Y_OFFSET, 0));
    const targetRotationMatrix = new THREE.Matrix4().lookAt(camera.position, lookAtPosition, camera.up);
    const targetCameraQuaternion = new THREE.Quaternion().setFromRotationMatrix(targetRotationMatrix);

    const cameraRoll = yawDelta * CAMERA_CONFIG.ROLL_FACTOR;
    const rollQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), cameraRoll);
    targetCameraQuaternion.multiply(rollQuaternion);

    camera.quaternion.slerp(targetCameraQuaternion, CAMERA_CONFIG.QUATERNION_SLERP);

    const targetFov = CAMERA_CONFIG.BASE_FOV + speed * CAMERA_CONFIG.SPEED_FOV_FACTOR;
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.05);
    camera.updateProjectionMatrix();

    const targetQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(player.targetRotation.x, player.targetRotation.y, 0, 'YXZ'));
    const indicatorDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(targetQuaternion);
    const indicatorDistance = 6;
    const targetIndicatorPosition = player.mesh.position.clone().add(indicatorDirection.multiplyScalar(indicatorDistance));
    directionIndicator.position.lerp(targetIndicatorPosition, 0.2);

    updateTerrainInteraction();
    updateAirStreams();

    world.getActiveWaterMeshes().forEach(mesh => {
        if (mesh.material.uniforms) {
            mesh.material.uniforms.u_time.value = elapsedTime;
            mesh.material.uniforms.u_sunDirection.value.copy(sun).normalize();
        }
    });

    score = Math.floor(Math.abs(player.mesh.position.z));
    uiManager.updateScoreAndSpeed(score, speed);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();