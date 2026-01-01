import './style.css';
import * as THREE from 'three';
import { WorldManager } from './world/WorldManager.js';
import { RacePath } from './world/RacePath.js';
import { Player } from './Player.js';

// Configuration
const RENDER_DISTANCE = 200;

// UI references
const pauseMenu = document.getElementById('pause-menu');

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 10, RENDER_DISTANCE);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(50, 100, 50);
scene.add(dirLight);

// Game Systems
const racePath = new RacePath(scene);
const worldManager = new WorldManager(scene, racePath);
const player = new Player(scene, camera, worldManager);

// State management
let isGameActive = false;

function onPointerLockChange() {
    if (document.pointerLockElement === document.body) {
        isGameActive = true;
        pauseMenu.style.display = 'none';
    } else {
        isGameActive = false;
        pauseMenu.style.display = 'flex';
    }
}

document.addEventListener('pointerlockchange', onPointerLockChange);

// Request pointer lock on click
document.body.addEventListener('click', () => {
    if (!isGameActive) {
        document.body.requestPointerLock();
    }
});

// Resize handler
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Game loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    // Update physics only when active
    if (isGameActive) {
        const dt = Math.min(clock.getDelta(), 0.1); // Limit delta time
        player.update(dt);
        worldManager.update(player.position);
    } else {
        // Flush clock when paused
        clock.getDelta(); 
    }

    renderer.render(scene, camera);
}

animate();