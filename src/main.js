import './style.css';
import * as THREE from 'three';
import { WorldManager } from './world/WorldManager.js';
import { RacePath } from './world/RacePath.js';
import { Sky } from './world/Sky.js'; 
import { Player } from './Player.js';
import { UIManager } from './ui/UIManager.js';
import { FPSCounter } from './ui/FPSCounter.js';
import { settingsManager } from './settings/SettingsManager.js';
import { CONFIG } from './config/Config.js';
import { BLOCK } from './world/BlockDefs.js';

// Scene setup
const scene = new THREE.Scene();
// Initialize fog with placeholder values; they will be overwritten by applyGraphicsSettings immediately
scene.fog = new THREE.Fog(
    CONFIG.GRAPHICS.FOG.COLOR, 
    10, 
    100
); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ 
    antialias: false,
    powerPreference: "high-performance",
    precision: "mediump",
    stencil: false 
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true; 
renderer.shadowMap.type = THREE.PCFShadowMap; 

document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;

const d = CONFIG.WORLD.MAX_SHADOW_DIST; 
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;

dirLight.shadow.mapSize.width = 512;
dirLight.shadow.mapSize.height = 512;
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

const racePath = new RacePath(scene);
const sky = new Sky(scene); 
const worldManager = new WorldManager(scene, racePath);
const player = new Player(scene, camera, worldManager);

let gameScore = 0;
let isGameRunning = false; 

racePath.clear();
worldManager.reset();

const uiManager = new UIManager(player);
const fpsCounter = new FPSCounter();

// --- GRAPHICS SETTINGS ---
const applyGraphicsSettings = () => {
    const quality = settingsManager.get('quality');
    
    // Presets
    let pixelRatio = 1.5;
    let shadows = true;
    let renderDist = 10;
    
    if (quality === 'LOW') {
        pixelRatio = 0.8;
        shadows = false;
        renderDist = 6;
    } else if (quality === 'MEDIUM') {
        pixelRatio = 1.0;
        shadows = true;
        renderDist = 8;
    }
    // HIGH (default) falls through

    // 1. Pixel Ratio (Resolution)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatio));
    
    // 2. Shadows
    if (dirLight.castShadow !== shadows) {
        dirLight.castShadow = shadows;
    }

    // 3. Render Distance
    worldManager.setRenderDistance(renderDist);
    
    // 4. Fog
    const renderDistUnits = renderDist * CONFIG.WORLD.CHUNK_SIZE;
    const fogFar = renderDistUnits - CONFIG.GRAPHICS.FOG.FAR_OFFSET;
    
    // Update Fog: Ensure near is proportionally smaller than far so the game isn't blank
    scene.fog.far = fogFar;
    scene.fog.near = Math.max(10, fogFar * 0.6); 
};

// Apply immediately on load
applyGraphicsSettings();

// Listen for changes
uiManager.setSettingsChangeHandler(applyGraphicsSettings);
// -------------------------

uiManager.setRestartHandler((mode) => {
    isGameRunning = true;
    gameScore = 0;
    player.reset();

    if (!racePath.hasPath()) {
        mode = 'hard';
    }

    if (mode === 'hard') {
        racePath.reset();
        worldManager.reset(); 
    } else {
        racePath.resetRings();
    }
    
    worldManager.update(player.position, camera); 
});

uiManager.setExitHandler(() => {
    isGameRunning = false;
    player.keys.forward = false; 
    
    racePath.clear();
    worldManager.reset();
});

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

const clock = new THREE.Clock();
let lastFrameTime = 0;
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
        sky.update(dt, player.position);
        racePath.update(dt, player.position);

        if (uiManager.activeScreen === 'HUD') {
            if (player.consumeResetInput()) {
                uiManager.onGameRestart('soft'); 
            }

            player.update(dt);
            
            worldManager.update(player.position, camera);

            if (player.position.y < CONFIG.GAME.FLOOR_LIMIT || player.position.y > CONFIG.GAME.CEILING_LIMIT) {
                uiManager.onGameOver();
            }

            // Game Over if player lands on anything other than spawn platform
            if (player.onGround && player.groundBlock !== BLOCK.SPAWN) {
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
            
            // Only update shadow target if shadows are actually enabled
            if (dirLight.castShadow && time - lastShadowUpdate > 200) {
                dirLight.position.x = player.position.x + 50;
                dirLight.position.z = player.position.z + 50;
                dirLight.target.position.copy(player.position);
                dirLight.target.updateMatrixWorld();
                lastShadowUpdate = time;
            }
        } else {
            sky.update(dt, player.position);
        }
    } else {
        const t = Date.now() * 0.0001;
        
        camera.position.set(Math.sin(t) * 50, 40, Math.cos(t) * 50);
        camera.lookAt(0, 40, 0);
        
        sky.update(dt, camera.position);
    }

    renderer.render(scene, camera);
}

animate(0);