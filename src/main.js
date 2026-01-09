import './style.css';
import * as THREE from 'three';
import { WorldManager } from './world/WorldManager.js';
import { RacePath } from './world/RacePath.js';
import { Sky } from './world/Sky.js'; // Import Sky
import { Player } from './Player.js';
import { UIManager } from './ui/UIManager.js';
import { FPSCounter } from './ui/FPSCounter.js';
import { settingsManager } from './settings/SettingsManager.js';

// Configuration
// Fog distance is 200, so we need chunks to cover roughly that distance.
// 200 units / 16 units per chunk ~= 12.5 chunks.
const RENDER_DISTANCE_UNITS = 200;
const CHUNK_RENDER_DISTANCE = 14; 

// Scene setup
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x87CEEB, 80, RENDER_DISTANCE_UNITS); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// Enable shadow maps for depth
renderer.shadowMap.enabled = true; 
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); 
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;

// Shadow Optimization:
// Keep the shadow box tight around the player. We don't need shadows at max render distance.
// 60 units radius covers the immediate area where high-detail shadows matter.
const d = 60; 
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;

// Increase map size for crispness, but the tight camera frustum helps performance
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

// Game Systems
const racePath = new RacePath(scene);
const sky = new Sky(scene); // Initialize Sky
const worldManager = new WorldManager(scene, racePath, 16, CHUNK_RENDER_DISTANCE);
const player = new Player(scene, camera, worldManager);

// Game State
let gameScore = 0;

// UI Systems
const uiManager = new UIManager(player);
const fpsCounter = new FPSCounter();

// Pointer Lock
document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === document.body) {
        if (uiManager.activeScreen !== 'HUD') {
            uiManager.showScreen('HUD');
        }
    } else {
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
let lastFrameTime = 0;

function animate(time) {
    requestAnimationFrame(animate);

    const fpsLimit = settingsManager.get('fpsLimit');

    if (fpsLimit > 0 && fpsLimit < 999) {
        const interval = 1000 / fpsLimit;
        const delta = time - lastFrameTime;
        if (delta < interval) return;
        lastFrameTime = time - (delta % interval);
    } else {
        lastFrameTime = time;
    }

    const dt = Math.min(clock.getDelta(), 0.1); 

    fpsCounter.update();

    // Update Sky and Path
    sky.update(dt, player.position);
    racePath.update(dt);

    if (uiManager.activeScreen === 'HUD') {
        player.update(dt);
        worldManager.update(player.position);

        // Check Ring Collisions
        const collisionResult = racePath.checkCollisions(player);
        if (collisionResult.scoreIncrease > 0) {
            gameScore += collisionResult.scoreIncrease;
        }
        if (collisionResult.boosted) {
            // Apply 40 units of boost
            player.applyBoost(40.0);
        }

        uiManager.hud.update(player, gameScore);
        
        // Keep light centered on player
        dirLight.position.x = player.position.x + 50;
        dirLight.position.z = player.position.z + 50;
        dirLight.target.position.copy(player.position);
        dirLight.target.updateMatrixWorld();
    } else {
        // Cinematic Camera Rotation
        const t = Date.now() * 0.0001;
        const radius = 20;
        camera.position.x = player.position.x + Math.sin(t) * radius;
        camera.position.z = player.position.z + Math.cos(t) * radius;
        camera.position.y = player.position.y + 10;
        camera.lookAt(player.position);
        
        sky.update(dt, player.position);
    }

    renderer.render(scene, camera);
}

animate(0);