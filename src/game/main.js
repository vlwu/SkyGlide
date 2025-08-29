import * as THREE from 'three';
import { World } from './World.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

let scene, camera, renderer, player, playerMesh, world, raycaster, sky, sun, directionIndicator;
let airStreams = [];
const STREAM_SEGMENTS = 20;
const STREAM_WIDTH = 0.12;

let previousYaw = 0;

const playerVelocity = new THREE.Vector3(0, 0, 0);
const gravity = new THREE.Vector3(0, -0.003, 0);
let targetRotation = { x: 0, y: 0 };
const liftForce = 0.005;

const forwardThrust = 0.016;

let isGameOver = false;
let isPaused = false;
let score = 0;
let scoreElement, gameOverOverlay, pauseOverlay, gameContainer, pauseScoreElement, resumeButton, settingsOverlay, settingsButton, backFromSettingsButton, fullscreenButton;

let invertMousePitch = false;

function init() {

    scene = new THREE.Scene();



    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 5);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5;
    gameContainer = document.getElementById('game-container');
    gameContainer.appendChild(renderer.domElement);


    sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);

    sun = new THREE.Vector3();


    const effectController = {
        turbidity: 10,
        rayleigh: 3,
        mieCoefficient: 0.005,
        mieDirectionalG: 0.7,
        elevation: 5,
        azimuth: 180,
    };

    const uniforms = sky.material.uniforms;
    uniforms['turbidity'].value = effectController.turbidity;
    uniforms['rayleigh'].value = effectController.rayleigh;
    uniforms['mieCoefficient'].value = effectController.mieCoefficient;
    uniforms['mieDirectionalG'].value = effectController.mieDirectionalG;

    const phi = THREE.MathUtils.degToRad(90 - effectController.elevation);
    const theta = THREE.MathUtils.degToRad(effectController.azimuth);

    sun.setFromSphericalCoords(1, phi, theta);

    uniforms['sunPosition'].value.copy(sun);

    scoreElement = document.getElementById('score-container');
    gameOverOverlay = document.getElementById('game-over-overlay');
    pauseOverlay = document.getElementById('pause-overlay');
    pauseScoreElement = document.getElementById('pause-score');
    resumeButton = document.getElementById('resume-button');
    settingsOverlay = document.getElementById('settings-overlay');
    settingsButton = document.getElementById('settings-button');
    backFromSettingsButton = document.getElementById('back-from-settings-button');
    fullscreenButton = document.getElementById('fullscreen-button');
    const invertPitchToggle = document.getElementById('invert-pitch-toggle');

    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x4caf50, 0.6);
    scene.add(hemisphereLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.copy(sun).multiplyScalar(50);
    scene.add(directionalLight);

    player = new THREE.Group();
    const playerGeometry = new THREE.OctahedronGeometry(0.5);
    const playerMaterial = new THREE.MeshPhysicalMaterial({
        metalness: 0.2,
        roughness: 0.1,
        transmission: 0.95,
        ior: 1.7,
        thickness: 0.8,
        transparent: true
    });
    playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
    playerMesh.scale.set(2, 0.8, 1.2);
    playerMesh.rotation.x = Math.PI / 2;
    player.add(playerMesh);
    player.position.y = 150;
    scene.add(player);
    player.updateMatrixWorld(true);



    const streamOrigins = [
        new THREE.Vector3(0.5, 0, -0.1),
        new THREE.Vector3(-0.5, 0, -0.1),
    ];

    streamOrigins.forEach(vertex => {
        const points = [];
        const initialWorldPos = playerMesh.localToWorld(vertex.clone());
        for (let i = 0; i < STREAM_SEGMENTS; i++) {
            points.push(initialWorldPos.clone());
        }

        const streamGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(STREAM_SEGMENTS * 2 * 3);
        const colors = new Float32Array(STREAM_SEGMENTS * 2 * 3);
        streamGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        streamGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const indices = [];
        for (let i = 0; i < STREAM_SEGMENTS - 1; i++) {
            const p1 = i * 2;
            const p2 = p1 + 1;
            const p3 = p1 + 2;
            const p4 = p1 + 3;
            indices.push(p1, p2, p3);
            indices.push(p2, p4, p3);
        }
        streamGeometry.setIndex(indices);

        const streamMaterial = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            side: THREE.FrontSide,
            opacity: 0.5
        });

        const streamMesh = new THREE.Mesh(streamGeometry, streamMaterial);
        streamMesh.frustumCulled = false;

        airStreams.push({
            mesh: streamMesh,
            origin: vertex.clone(),
            points: points,
            material: streamMaterial
        });
        scene.add(streamMesh);
    });


    const indicatorGeometry = new THREE.SphereGeometry(0.15, 8, 8);
    const indicatorMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
    directionIndicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    directionIndicator.visible = false;
    scene.add(directionIndicator);


    world = new World(scene);

    raycaster = new THREE.Raycaster();

    camera.lookAt(player.position);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerlockchange', onPointerLockChange, false);
    gameOverOverlay.addEventListener('click', restartGame);
    resumeButton.addEventListener('click', togglePause);
    settingsButton.addEventListener('click', showSettings);
    backFromSettingsButton.addEventListener('click', hideSettings);
    fullscreenButton.addEventListener('click', toggleFullscreen);
    invertPitchToggle.addEventListener('change', (event) => {
        invertMousePitch = event.target.checked;
        localStorage.setItem('invertMousePitch', invertMousePitch);
    });

    const savedInvertSetting = localStorage.getItem('invertMousePitch');
    if (savedInvertSetting !== null) {
        invertMousePitch = savedInvertSetting === 'true';
        invertPitchToggle.checked = invertMousePitch;
    }


    animate();


    const introOverlay = document.getElementById('intro-overlay');
    if (introOverlay) {
        const startGame = () => {
            introOverlay.style.opacity = '0';
            setTimeout(() => introOverlay.style.display = 'none', 1500);
            gameContainer.requestPointerLock();
            directionIndicator.visible = true;
            introOverlay.removeEventListener('click', startGame);
        };
        introOverlay.addEventListener('click', startGame);
    }
}

function onPointerLockChange() {

    if (document.pointerLockElement !== gameContainer && !isGameOver && !isPaused) {
        togglePause();
    }
}

function onMouseMove(event) {

    if (document.pointerLockElement !== gameContainer || isPaused || isGameOver) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;


    targetRotation.y -= movementX * 0.002;

    if (invertMousePitch) {
        targetRotation.x += movementY * 0.002;
    } else {
        targetRotation.x -= movementY * 0.002;
    }
}

function onKeyDown(event) {
    if (event.key === 'Escape') {
        if (settingsOverlay.style.opacity === '1') {
            hideSettings();
        } else {
            togglePause();
        }
        return;
    }

    if (isPaused || isGameOver) return;

    if (event.key === 'ArrowLeft') {
        targetRotation.y += 0.5;
    } else if (event.key === 'ArrowRight') {
        targetRotation.y -= 0.5;
    } else if (event.key === 'ArrowUp') {
        targetRotation.x -= 0.3;
    } else if (event.key === 'ArrowDown') {
        targetRotation.x += 0.3;
    }
}

function togglePause() {
    if (isGameOver) return;
    isPaused = !isPaused;

    if (isPaused) {
        pauseScoreElement.textContent = `Score: ${score}`;
        pauseOverlay.style.display = 'flex';
        setTimeout(() => pauseOverlay.style.opacity = '1', 10);
        document.exitPointerLock();
        directionIndicator.visible = false;
    } else {
        pauseOverlay.style.opacity = '0';
        setTimeout(() => {
            pauseOverlay.style.display = 'none';
            gameContainer.requestPointerLock();
        }, 500);
        directionIndicator.visible = true;
    }
}

function showSettings() {

    pauseOverlay.style.opacity = '0';

    setTimeout(() => { pauseOverlay.style.display = 'none'; }, 500);

    settingsOverlay.style.display = 'flex';
    setTimeout(() => { settingsOverlay.style.opacity = '1'; }, 10);
}

function hideSettings() {

    settingsOverlay.style.opacity = '0';
    setTimeout(() => { settingsOverlay.style.display = 'none'; }, 500);

    pauseOverlay.style.display = 'flex';
    setTimeout(() => { pauseOverlay.style.opacity = '1'; }, 10);
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

function handleCollision() {
    isGameOver = true;
    gameOverOverlay.style.display = 'flex';
    setTimeout(() => gameOverOverlay.style.opacity = '1', 10);
    document.exitPointerLock();
    directionIndicator.visible = false;
}

function restartGame() {
    isGameOver = false;

    player.position.set(0, 150, 0);
    player.rotation.set(0, 0, 0);
    playerVelocity.set(0, 0, 0);
    targetRotation = { x: 0, y: 0 };

    playerMesh.rotation.set(Math.PI / 2, 0, 0);
    previousYaw = 0;

    player.updateMatrixWorld(true);


    airStreams.forEach(stream => {
        const initialWorldPos = stream.origin.clone().applyMatrix4(playerMesh.matrixWorld);
        for (let i = 0; i < STREAM_SEGMENTS; i++) {
            stream.points[i].copy(initialWorldPos);
        }

        updateAirStreams();
    });

    world.reset();
    score = 0;

    gameOverOverlay.style.opacity = '0';
    setTimeout(() => gameOverOverlay.style.display = 'none', 1500);

    directionIndicator.visible = true;
    gameContainer.requestPointerLock();
}

function checkCollisions() {

    raycaster.set(player.position, new THREE.Vector3(0, -1, 0));

    const terrainMeshes = world.getActiveTerrainMeshes();
    if (terrainMeshes.length === 0) return;

    const intersects = raycaster.intersectObjects(terrainMeshes);

    if (intersects.length > 0) {

        if (intersects[0].distance < 1.0) {
            handleCollision();
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
    const speed = playerVelocity.length();

    const opacity = THREE.MathUtils.clamp(speed * 1.0, 0.05, 0.35);

    const upVector = new THREE.Vector3(0, 1, 0).applyQuaternion(playerMesh.quaternion);

    const startColor = new THREE.Color(0.9, 0.95, 1.0);
    const endColor = new THREE.Color(0.5, 0.7, 1.0);

    airStreams.forEach(stream => {
        const currentWorldPos = stream.origin.clone().applyMatrix4(playerMesh.matrixWorld);


        for (let i = STREAM_SEGMENTS - 1; i > 0; i--) {
            stream.points[i].copy(stream.points[i - 1]);
        }
        stream.points[0].copy(currentWorldPos);

        const positions = stream.mesh.geometry.attributes.position.array;
        const colors = stream.mesh.geometry.attributes.color.array;

        for (let i = 0; i < STREAM_SEGMENTS; i++) {
            const point = stream.points[i];

            const ribbonUp = upVector.clone().multiplyScalar(STREAM_WIDTH / 2);
            const p1 = point.clone().add(ribbonUp);
            const p2 = point.clone().sub(ribbonUp);

            positions[i * 6 + 0] = p1.x;
            positions[i * 6 + 1] = p1.y;
            positions[i * 6 + 2] = p1.z;

            positions[i * 6 + 3] = p2.x;
            positions[i * 6 + 4] = p2.y;
            positions[i * 6 + 5] = p2.z;


            const alpha = i / (STREAM_SEGMENTS - 1);
            const currentColor = new THREE.Color().lerpColors(startColor, endColor, alpha);

            colors[i * 6 + 0] = currentColor.r;
            colors[i * 6 + 1] = currentColor.g;
            colors[i * 6 + 2] = currentColor.b;

            colors[i * 6 + 3] = currentColor.r;
            colors[i * 6 + 4] = currentColor.g;
            colors[i * 6 + 5] = currentColor.b;
        }

        stream.mesh.geometry.attributes.position.needsUpdate = true;
        stream.mesh.geometry.attributes.color.needsUpdate = true;
        stream.material.opacity = opacity;
    });
}

function update() {

    const maxPitch = Math.PI / 2 - 0.1;
    targetRotation.x = Math.max(-maxPitch, Math.min(maxPitch, targetRotation.x));

    player.rotation.x = THREE.MathUtils.lerp(player.rotation.x, targetRotation.x, 0.05);
    player.rotation.y = THREE.MathUtils.lerp(player.rotation.y, targetRotation.y, 0.05);

    const yawDelta = player.rotation.y - previousYaw;
    previousYaw = player.rotation.y;
    const rollSpeed = yawDelta * -8;

    const tumbleSpeed = playerVelocity.y * -1.5;

    playerMesh.rotateY(rollSpeed);
    playerMesh.rotateX(tumbleSpeed);

    const forwardVector = new THREE.Vector3(0, 0, -1);
    forwardVector.applyQuaternion(player.quaternion);

    playerVelocity.add(forwardVector.multiplyScalar(forwardThrust));

    playerVelocity.add(gravity);

    const diveAngle = player.rotation.x;
    const liftAmount = Math.max(0, 1.0 - Math.abs(diveAngle)) * liftForce;
    playerVelocity.y += liftAmount * Math.abs(playerVelocity.z);

    player.position.add(playerVelocity);

    playerVelocity.multiplyScalar(0.99);

    player.updateMatrixWorld(true);

    const cameraOffset = new THREE.Vector3(0, 2.0, 5.0);
    cameraOffset.applyQuaternion(player.quaternion);
    const targetCameraPosition = player.position.clone().add(cameraOffset);
    camera.position.lerp(targetCameraPosition, 0.1);
    camera.lookAt(player.position);

    world.update(player.position);

    const targetQuaternion = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(targetRotation.x, targetRotation.y, 0, 'YXZ')
    );
    const indicatorDirection = new THREE.Vector3(0, 0, -1);
    indicatorDirection.applyQuaternion(targetQuaternion);
    const indicatorDistance = 6;
    const targetIndicatorPosition = player.position.clone().add(indicatorDirection.multiplyScalar(indicatorDistance));
    directionIndicator.position.lerp(targetIndicatorPosition, 0.2);


    checkCollisions();
    updateAirStreams();

    score = Math.floor(Math.abs(player.position.z));
    scoreElement.textContent = `Score: ${score}`;
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();