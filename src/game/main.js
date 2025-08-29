import * as THREE from 'three';
import { World } from './World.js';

let scene, camera, renderer, player, world, ground;
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
let scoreElement, gameOverOverlay, pauseOverlay;

function init() {
    // --- Scene Setup ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue
    scene.fog = new THREE.Fog(0x87CEEB, 50, 200); // Add fog for depth

    // --- Camera ---
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 5);

    // --- Renderer ---
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('game-container').appendChild(renderer.domElement);

    // --- UI Elements ---
    scoreElement = document.getElementById('score-container');
    gameOverOverlay = document.getElementById('game-over-overlay');
    pauseOverlay = document.getElementById('pause-overlay');

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // --- Player ---
    // Create a group to act as the player's physics object
    player = new THREE.Group();
    const playerGeometry = new THREE.OctahedronGeometry(0.5);
    const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xff4500, metalness: 0.3, roughness: 0.6 });
    const playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
    playerMesh.scale.set(2, 0.8, 1.2); // Elytra-like shape
    playerMesh.rotation.x = Math.PI / 2; // Rotate the visible mesh 90 degrees
    player.add(playerMesh); // Add the mesh to the group
    scene.add(player); // Add the group to the scene

    // --- World ---
    world = new World(scene);

    // --- Ground Plane for reference ---
    const groundGeometry = new THREE.PlaneGeometry(500, 500, 50, 50);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x4caf50, wireframe: true });
    ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -25;
    scene.add(ground);


    camera.lookAt(player.position);

    // --- Event Listeners ---
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', () => {
        if (isGameOver) restartGame();
    });

    // --- Start ---
    animate();

    // Fade out intro
    const introOverlay = document.getElementById('intro-overlay');
    if (introOverlay) {
        setTimeout(() => {
            introOverlay.style.opacity = '0';
            setTimeout(() => introOverlay.style.display = 'none', 1500);
        }, 500);
    }
}

function onMouseMove(event) {
    if (isPaused || isGameOver) return; // Ignore mouse movement when paused or game over

    const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    const mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
    // Control player's pitch (up/down) and yaw (left/right)
    targetRotation.x = mouseY * 0.8;
    targetRotation.y = -mouseX * 1.2;
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
        pauseOverlay.style.display = 'flex';
        setTimeout(() => pauseOverlay.style.opacity = '1', 10);
    } else {
        pauseOverlay.style.opacity = '0';
        setTimeout(() => pauseOverlay.style.display = 'none', 500); // Match CSS transition duration
    }
}

function handleCollision() {
    isGameOver = true;
    gameOverOverlay.style.display = 'flex';
    setTimeout(() => gameOverOverlay.style.opacity = '1', 10); // Fade in
}

function restartGame() {
    isGameOver = false;

    // Reset player physics and position
    player.position.set(0, 0, 0);
    player.rotation.set(0, 0, 0); // Reset group's rotation
    playerVelocity.set(0, 0, 0);
    targetRotation = { x: 0, y: 0 };


    // Reset world and score
    world.reset();
    score = 0;

    // Hide overlay
    gameOverOverlay.style.opacity = '0';
    setTimeout(() => gameOverOverlay.style.display = 'none', 1500);
}


function checkCollisions() {
    // Note: Using the first child for collision. If more complex models are added, this may need adjustment.
    const playerBox = new THREE.Box3().setFromObject(player.children[0]);
    for (const obstacle of world.obstaclePool) {
        const obstacleBox = new THREE.Box3().setFromObject(obstacle);
        if (playerBox.intersectsBox(obstacleBox)) {
            handleCollision();
            break;
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

    // Make ground infinite by having it follow the player
    if (ground) {
        ground.position.x = player.position.x;
        ground.position.z = player.position.z;
    }

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
    world.update(player.position.z);

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