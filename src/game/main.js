import * as THREE from 'three';
import { World } from './World.js';

let scene, camera, renderer, player, world;
let targetPlayerX = 0; // Target X position for the player, controlled by mouse/keys

// Game State
let isGameOver = false;
let score = 0;
let scoreElement, gameOverOverlay;

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('game-container').appendChild(renderer.domElement);

    // UI Elements
    scoreElement = document.getElementById('score-container');
    gameOverOverlay = document.getElementById('game-over-overlay');

    // Player
    const playerGeometry = new THREE.OctahedronGeometry(0.7);
    const playerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    player = new THREE.Mesh(playerGeometry, playerMaterial);
    player.scale.set(2, 0.6, 1);
    scene.add(player);

    // World
    world = new World(scene);

    camera.lookAt(player.position);

    // Event Listeners
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', () => {
        if (isGameOver) restartGame();
    });

    // Start the animation loop
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
    const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    targetPlayerX = mouseX * 10;
}

function onKeyDown(event) {
    const moveDistance = 2;
    if (event.key === 'ArrowLeft') {
        targetPlayerX -= moveDistance;
    } else if (event.key === 'ArrowRight') {
        targetPlayerX += moveDistance;
    }
}

function handleCollision() {
    isGameOver = true;
    gameOverOverlay.style.display = 'flex';
    setTimeout(() => gameOverOverlay.style.opacity = '1', 10); // Fade in
}

function restartGame() {
    isGameOver = false;

    // Reset player
    player.position.set(0, 0, 0);
    camera.position.set(0, 5, 10);
    targetPlayerX = 0;

    // Reset world and score
    world.reset();
    score = 0;

    // Hide overlay
    gameOverOverlay.style.opacity = '0';
    setTimeout(() => gameOverOverlay.style.display = 'none', 1500);
}


function checkCollisions() {
    for (const obstacle of world.obstaclePool) {
        const distance = player.position.distanceTo(obstacle.position);
        // The obstacle's torus radius is 2, and we add a small buffer for the player size.
        if (distance < 2.5) {
            handleCollision();
            break; // Exit loop once a collision is found
        }
    }
}


function animate() {
    requestAnimationFrame(animate);

    // Update game logic
    if (!isGameOver) {
        update();
    }

    renderer.render(scene, camera);
}

function update() {
    // Forward movement
    player.position.z -= 0.15;

    // Smoothly move player horizontally
    player.position.x = THREE.MathUtils.lerp(player.position.x, targetPlayerX, 0.1);

    // Update camera to follow player
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, player.position.x, 0.1);
    camera.position.y = player.position.y + 2;
    camera.position.z = player.position.z + 5;

    // Update world obstacles
    world.update(player.position.z);

    // Check for collisions
    checkCollisions();
    
    // Update score
    score = Math.floor(Math.abs(player.position.z));
    scoreElement.textContent = `Score: ${score}`;
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();