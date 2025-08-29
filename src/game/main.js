import * as THREE from 'three';
import { World } from './World.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

let scene, camera, renderer, player, playerMesh, world, raycaster, sky, sun;
let previousYaw = 0; // For calculating turn rate
// --- Physics & Control Variables ---
const playerVelocity = new THREE.Vector3(0, 0, 0);
const gravity = new THREE.Vector3(0, -0.003, 0);
let targetRotation = { x: 0, y: 0 };
const liftForce = 0.005;
// Player flight speed reduced to 80% of its previous value
const forwardThrust = 0.016;

// --- Game State ---
let isGameOver = false;
let isPaused = false;
let score = 0;
let scoreElement, gameOverOverlay, pauseOverlay, gameContainer, pauseScoreElement, resumeButton;

function init() {
    // --- Scene Setup ---
    scene = new THREE.Scene();
    const skyColor = 0x87CEEB;
    scene.fog = new THREE.Fog(skyColor, 150, 400); // Adjusted fog for larger world

    // --- Camera ---
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 5);

    // --- Renderer ---
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    gameContainer = document.getElementById('game-container');
    gameContainer.appendChild(renderer.domElement);
    
    // --- Procedural Sky ---
    sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);

    sun = new THREE.Vector3();
    
    const effectController = {
        turbidity: 10,
        rayleigh: 2,
        mieCoefficient: 0.005,
        mieDirectionalG: 0.8,
        elevation: 15, // angle of the sun
        azimuth: 180, // direction of the sun
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


    // --- UI Elements ---
    scoreElement = document.getElementById('score-container');
    gameOverOverlay = document.getElementById('game-over-overlay');
    pauseOverlay = document.getElementById('pause-overlay');
    pauseScoreElement = document.getElementById('pause-score');
    resumeButton = document.getElementById('resume-button');


    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.copy(sun).multiplyScalar(50); // Align light with sky's sun
    scene.add(directionalLight);

    // --- Player ---
    // Create a group to act as the player's physics object
    player = new THREE.Group();
    const playerGeometry = new THREE.OctahedronGeometry(0.5);
    const playerMaterial = new THREE.MeshPhysicalMaterial({
        metalness: 0.2,
        roughness: 0,
        transmission: 1.0,
        ior: 1.7,
        thickness: 0.8,
        transparent: true
    });
    playerMesh = new THREE.Mesh(playerGeometry, playerMaterial); // Assign to global variable
    playerMesh.scale.set(2, 0.8, 1.2); // Elytra-like shape
    playerMesh.rotation.x = Math.PI / 2; // Rotate the visible mesh 90 degrees
    player.add(playerMesh); // Add the mesh to the group
    player.position.y = 25; // Set initial spawn height
    scene.add(player); // Add the group to the scene

    // --- World ---
    world = new World(scene);

    // --- Collision Detection ---
    raycaster = new THREE.Raycaster();

    camera.lookAt(player.position);

    // --- Event Listeners ---
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerlockchange', onPointerLockChange, false);
    gameOverOverlay.addEventListener('click', restartGame);
    resumeButton.addEventListener('click', togglePause);

    // --- Start ---
    animate();

    // Wait for click on intro to start game and lock pointer
    const introOverlay = document.getElementById('intro-overlay');
    if (introOverlay) {
        const startGame = () => {
            introOverlay.style.opacity = '0';
            setTimeout(() => introOverlay.style.display = 'none', 1500);
            gameContainer.requestPointerLock();
            introOverlay.removeEventListener('click', startGame);
        };
        introOverlay.addEventListener('click', startGame);
    }
}

function onPointerLockChange() {
    // If the pointer is unlocked by the user (e.g., pressing Esc), pause the game
    if (document.pointerLockElement !== gameContainer && !isGameOver && !isPaused) {
        togglePause();
    }
}

function onMouseMove(event) {
    // Ignore mouse movement if pointer is not locked or game is not active
    if (document.pointerLockElement !== gameContainer || isPaused || isGameOver) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    // Adjust target rotation based on the change in mouse position
    targetRotation.y -= movementX * 0.002;
    targetRotation.x -= movementY * 0.002;

    // Clamp the vertical pitch to prevent the player from flipping over
    const maxPitch = Math.PI / 2 - 0.1; // Approx +/- 85 degrees
    targetRotation.x = Math.max(-maxPitch, Math.min(maxPitch, targetRotation.x));
}

function onKeyDown(event) {
    if (event.key === 'Escape') {
        togglePause();
        return;
    }

    if (isPaused || isGameOver) return; // Ignore key presses when paused or game over

    // Left/Right arrow keys for roll/turning effect
    if (event.key === 'ArrowLeft') {
        targetRotation.y += 0.5;
    } else if (event.key === 'ArrowRight') {
        targetRotation.y -= 0.5;
    }
}

function togglePause() {
    if (isGameOver) return; // Don't allow pausing on the game over screen
    isPaused = !isPaused;

    if (isPaused) {
        pauseScoreElement.textContent = `Score: ${score}`;
        pauseOverlay.style.display = 'flex';
        setTimeout(() => pauseOverlay.style.opacity = '1', 10);
        document.exitPointerLock(); // Release the cursor
    } else {
        pauseOverlay.style.opacity = '0';
        setTimeout(() => pauseOverlay.style.display = 'none', 500); // Match CSS transition duration
        gameContainer.requestPointerLock(); // Re-lock the cursor
    }
}

function handleCollision() {
    isGameOver = true;
    gameOverOverlay.style.display = 'flex';
    setTimeout(() => gameOverOverlay.style.opacity = '1', 10); // Fade in
    document.exitPointerLock(); // Release the cursor on game over
}

function restartGame() {
    isGameOver = false;

    // Reset player physics and position
    player.position.set(0, 25, 0); // Set respawn height
    player.rotation.set(0, 0, 0); // Reset group's rotation
    playerVelocity.set(0, 0, 0);
    targetRotation = { x: 0, y: 0 };
    
    // Reset visual mesh rotation and yaw tracker
    playerMesh.rotation.set(Math.PI / 2, 0, 0);
    previousYaw = 0;


    // Reset world and score
    world.reset();
    score = 0;

    // Hide overlay
    gameOverOverlay.style.opacity = '0';
    setTimeout(() => gameOverOverlay.style.display = 'none', 1500);

    // Request pointer lock for the new game
    gameContainer.requestPointerLock();
}


function checkCollisions() {
    // Cast a ray downwards from the player's position
    raycaster.set(player.position, new THREE.Vector3(0, -1, 0));
    
    const terrainMeshes = world.getActiveTerrainMeshes();
    if (terrainMeshes.length === 0) return;

    const intersects = raycaster.intersectObjects(terrainMeshes);

    if (intersects.length > 0) {
        // Check if the player is very close to the ground
        if (intersects[0].distance < 1.0) { 
            handleCollision();
        }
    }
}


function animate() {
    requestAnimationFrame(animate);

    // Only update game logic if not paused and not game over
    if (!isGameOver && !isPaused) {
        update();
    }

    renderer.render(scene, camera);
}

function update() {
    // --- Flight Physics ---
    // Smoothly interpolate player group's rotation towards the target
    player.rotation.x = THREE.MathUtils.lerp(player.rotation.x, targetRotation.x, 0.05);
    player.rotation.y = THREE.MathUtils.lerp(player.rotation.y, targetRotation.y, 0.05);

    // --- Continuous Visual Rotation ---
    // Calculate Yaw Delta for Roll speed
    const yawDelta = player.rotation.y - previousYaw;
    previousYaw = player.rotation.y;
    const rollSpeed = yawDelta * -8; // Multiplier for sensitivity

    // Calculate Tumble speed from Vertical Velocity
    const tumbleSpeed = playerVelocity.y * -1.5; // Multiplier for sensitivity

    // Apply continuous rotation to the visible mesh on its local axes
    // This does not affect the physics or camera controls
    playerMesh.rotateY(rollSpeed); // Roll around its forward axis
    playerMesh.rotateX(tumbleSpeed); // Tumble around its side-to-side axis


    // Create a forward vector based on the group's orientation
    const forwardVector = new THREE.Vector3(0, 0, -1);
    forwardVector.applyQuaternion(player.quaternion);

    // Apply forward thrust
    playerVelocity.add(forwardVector.multiplyScalar(forwardThrust));

    // Apply Gravity
    playerVelocity.add(gravity);

    // Apply Lift
    const diveAngle = player.rotation.x; // Use group's rotation directly
    const liftAmount = Math.max(0, 1.0 - Math.abs(diveAngle)) * liftForce;
    playerVelocity.y += liftAmount * Math.abs(playerVelocity.z);


    // Apply velocity to player group's position
    player.position.add(playerVelocity);

    // Simple air drag
    playerVelocity.multiplyScalar(0.99);

    // --- Camera Logic ---
    // Camera follows player with a smooth delay
    const cameraOffset = new THREE.Vector3(0, 2.0, 5.0);
    cameraOffset.applyQuaternion(player.quaternion);
    const targetCameraPosition = player.position.clone().add(cameraOffset);
    camera.position.lerp(targetCameraPosition, 0.1);
    camera.lookAt(player.position);

    // --- World Update ---
    world.update(player.position);

    // --- Collision Check ---
    checkCollisions();
    
    // --- Score Update ---
    score = Math.floor(Math.abs(player.position.z));
    scoreElement.textContent = `Score: ${score}`;
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();