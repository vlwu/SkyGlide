import './style.css';
import * as THREE from 'three';
import { WorldManager } from './world/WorldManager.js';
import { RacePath } from './world/RacePath.js';
import { Sky } from './world/Sky.js'; 
import { Player } from './Player.js';
import { UIManager } from './ui/UIManager.js';
import { FPSCounter } from './ui/FPSCounter.js';
import { settingsManager } from './settings/SettingsManager.js';

// Configuration
// Feature: Increased Render Distance for better visuals
const RENDER_DISTANCE_UNITS = 200; 
const CHUNK_RENDER_DISTANCE = 12;  

// Scene setup
const scene = new THREE.Scene();
// Fog pushed back to match new render distance
scene.fog = new THREE.Fog(0xA0D0E0, 100, RENDER_DISTANCE_UNITS - 50); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

// Renderer Optimization
const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    powerPreference: "high-performance",
    precision: "mediump",
    stencil: false 
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);

// Shadow Map Optimization
renderer.shadowMap.enabled = true; 
renderer.shadowMap.type = THREE.PCFShadowMap; 

document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;

// Performance: Tight Shadow Frustum
// Reduced from 50 to 35. Matches the new chunk shadow culling distance (35).
// This reduces the workload on the shadow map significantly.
const d = 35; 
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;

// Small shadow map
dirLight.shadow.mapSize.width = 512;
dirLight.shadow.mapSize.height = 512;
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

// Game Systems
const racePath = new RacePath(scene);
const sky = new Sky(scene); 
const worldManager = new WorldManager(scene, racePath, 16, CHUNK_RENDER_DISTANCE);
const player = new Player(scene, camera, worldManager);

// Game State
let gameScore = 0;
// Optimization: Flag to control game load state (Prevents lag in main menu)
let isGameRunning = false; 

// Start logic: Clear any initial junk, wait for user start
racePath.clear();
worldManager.reset();

// UI Systems
const uiManager = new UIManager(player);
const fpsCounter = new FPSCounter();

// Handler for Soft (Retry) and Hard (New Path) resets
uiManager.setRestartHandler((mode) => {
    isGameRunning = true;
    gameScore = 0;
    player.reset();

    // Fix: If path is empty (initial load), force a hard reset (generation)
    if (!racePath.hasPath()) {
        mode = 'hard';
    }

    if (mode === 'hard') {
        // Generate new seed
        racePath.reset();
        worldManager.reset(); 
    } else {
        // Soft Reset: Reactivate all rings utilizing the helper to preserve branch colors
        racePath.resetRings();
    }
    
    // Force world update around spawn
    worldManager.update(player.position, camera); 
});

uiManager.setExitHandler(() => {
    // Stop game logic
    isGameRunning = false;
    player.keys.forward = false; // Kill inputs
    
    // Unload heavy assets to stop lag in menu
    racePath.clear();
    worldManager.reset();
});

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
// Optimization: Track last shadow update to reduce frequency
let lastShadowUpdate = 0;

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

    if (isGameRunning) {
        // GAME ACTIVE LOOP
        sky.update(dt, player.position);
        racePath.update(dt, player.position); // Pass player pos for culling

        if (uiManager.activeScreen === 'HUD') {
            if (player.consumeResetInput()) {
                uiManager.onGameRestart('soft'); 
            }

            player.update(dt);
            
            // Pass camera to WorldManager for smart frustration/direction culling
            worldManager.update(player.position, camera);

            if (player.position.y < -30) {
                uiManager.onGameOver();
            }

            const collisionResult = racePath.checkCollisions(player);
            if (collisionResult.scoreIncrease > 0) {
                gameScore += collisionResult.scoreIncrease;
            }
            
            if (collisionResult.boostAmount > 0) {
                player.applyBoost(collisionResult.boostAmount);
            }

            uiManager.hud.update(player, gameScore);
            
            // Optimization: Update shadow light position less frequently (every 100ms)
            if (time - lastShadowUpdate > 100) {
                dirLight.position.x = player.position.x + 50;
                dirLight.position.z = player.position.z + 50;
                dirLight.target.position.copy(player.position);
                dirLight.target.updateMatrixWorld();
                lastShadowUpdate = time;
            }
        } else {
            // PAUSE MENU (Game running but paused)
            sky.update(dt, player.position);
            // Don't update physics/world generation when paused to save resources
        }
    } else {
        // MAIN MENU LOOP (Game unloaded)
        // Just rotate camera for background ambiance (looking at sky)
        const t = Date.now() * 0.0001;
        
        // Simulating a camera flight or rotation around the empty void
        camera.position.set(Math.sin(t) * 50, 40, Math.cos(t) * 50);
        camera.lookAt(0, 40, 0);
        
        // Ensure sky is visible
        sky.update(dt, camera.position);
    }

    renderer.render(scene, camera);
}

animate(0);