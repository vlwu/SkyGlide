import './style.css';
import * as THREE from 'three';
import { WorldManager } from './world/WorldManager.js';
import { RacePath } from './world/RacePath.js';
import { Player } from './Player.js';
import { UIManager } from './ui/UIManager.js';
import { FPSCounter } from './ui/FPSCounter.js';

// Configuration
const RENDER_DISTANCE = 200;

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 20, RENDER_DISTANCE);

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

// UI Systems
const uiManager = new UIManager(player);
const fpsCounter = new FPSCounter();

// Pointer Lock State Handling
document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === document.body) {
        // Lock engaged -> Ensure we are in HUD mode
        if (uiManager.activeScreen !== 'HUD') {
            uiManager.showScreen('HUD');
        }
    } else {
        // Lock disengaged -> Pause (unless we are on the start menu)
        if (uiManager.activeScreen === 'HUD') {
            uiManager.onGamePause();
        }
    }
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Game loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1); 
    
    // FPS
    fpsCounter.update();

    if (uiManager.activeScreen === 'HUD') {
        // Game Playing
        player.update(dt);
        worldManager.update(player.position);
        uiManager.update();
    } else {
        // Main Menu / Pause: Cinematic Rotation
        // Slowly rotate camera around player position
        const time = Date.now() * 0.0001;
        const radius = 20;
        camera.position.x = player.position.x + Math.sin(time) * radius;
        camera.position.z = player.position.z + Math.cos(time) * radius;
        camera.position.y = player.position.y + 10;
        camera.lookAt(player.position);
    }

    renderer.render(scene, camera);
}

animate();