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
const RENDER_DISTANCE_UNITS = 160;
const CHUNK_RENDER_DISTANCE = 10; 

// Scene setup
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xA0D0E0, 40, RENDER_DISTANCE_UNITS - 10); 

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

// Tight Shadow Frustum
const d = 50; 
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

// UI Systems
const uiManager = new UIManager(player);
const fpsCounter = new FPSCounter();

uiManager.setRestartHandler(() => {
    gameScore = 0;
    player.reset();
    racePath.reset();
    worldManager.reset(); 
    worldManager.update(player.position); 
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

    sky.update(dt, player.position);
    racePath.update(dt);

    if (uiManager.activeScreen === 'HUD') {
        if (player.consumeResetInput()) {
            uiManager.onGameRestart();
        }

        player.update(dt);
        worldManager.update(player.position);

        if (player.position.y < -30) {
            uiManager.onGameOver();
        }

        // --- COLLISION LOGIC UPDATED ---
        const collisionResult = racePath.checkCollisions(player);
        if (collisionResult.scoreIncrease > 0) {
            gameScore += collisionResult.scoreIncrease;
        }
        
        // Use the variable boost amount from the smart generator
        if (collisionResult.boostAmount > 0) {
            player.applyBoost(collisionResult.boostAmount);
        }
        // --------------------------------

        uiManager.hud.update(player, gameScore);
        
        dirLight.position.x = player.position.x + 50;
        dirLight.position.z = player.position.z + 50;
        dirLight.target.position.copy(player.position);
        dirLight.target.updateMatrixWorld();
    } else {
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