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
dirLight.shadow.bias = -0.0005;

dirLight.shadow.mapSize.width = 512;
dirLight.shadow.mapSize.height = 512;

scene.add(dirLight);

const racePath = new RacePath(scene);
const sky = new Sky(scene); 
const worldManager = new WorldManager(scene, racePath);
const player = new Player(scene, camera, worldManager);

let gameScore = 0;
let isGameRunning = false; 
let gameStartTime = 0;
const spawnPos = new THREE.Vector3(0, 16, 0);

racePath.clear();
worldManager.reset();

const uiManager = new UIManager(player);
const fpsCounter = new FPSCounter();

const applyGraphicsSettings = () => {
    const quality = settingsManager.get('quality');
    
    let pixelRatio = 1.5;
    let shadows = true;
    let renderDist = 10;
    let shadowMapSize = 512;
    
    if (quality === 'LOW') {
        pixelRatio = 0.8;
        shadows = false;
        renderDist = 6;
        shadowMapSize = 256;
    } else if (quality === 'MEDIUM') {
        pixelRatio = 1.0;
        shadows = true;
        renderDist = 8;
        shadowMapSize = 256;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatio));
    
    if (dirLight.castShadow !== shadows) {
        dirLight.castShadow = shadows;
    }
    
    if (shadows) {
        if (dirLight.shadow.mapSize.width !== shadowMapSize) {
            dirLight.shadow.mapSize.width = shadowMapSize;
            dirLight.shadow.mapSize.height = shadowMapSize;
            dirLight.shadow.map = null; 
        }
    }

    worldManager.setRenderDistance(renderDist);
    
    const renderDistUnits = renderDist * CONFIG.WORLD.CHUNK_SIZE;
    const fogFar = renderDistUnits - CONFIG.GRAPHICS.FOG.FAR_OFFSET;
    
    scene.fog.far = fogFar;
    scene.fog.near = Math.max(10, fogFar * 0.6); 
};

applyGraphicsSettings();
uiManager.setSettingsChangeHandler(applyGraphicsSettings);

uiManager.setRestartHandler((mode) => {
    isGameRunning = true;
    gameScore = 0;
    gameStartTime = Date.now();
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
    
    worldManager.update(player, camera); 
});

uiManager.setExitHandler(() => {
    isGameRunning = false;
    player.keys.forward = false; 
    
    racePath.clear();
    worldManager.reset();
});

const triggerGameOver = () => {
    const dist = player.position.distanceTo(spawnPos);
    const time = (Date.now() - gameStartTime) / 1000;
    uiManager.onGameOver({
        score: gameScore,
        distance: dist,
        time: time
    });
};

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

const lastShadowPos = new THREE.Vector3(); 
let framesSinceShadowUpdate = 0;

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
            
            // Add Score from Proximity
            if (player.isNearTerrain) {
                gameScore += CONFIG.GAME.PROXIMITY.SCORE_RATE * dt;
            }

            worldManager.update(player, camera);

            if (player.position.y < CONFIG.GAME.FLOOR_LIMIT || player.position.y > CONFIG.GAME.CEILING_LIMIT) {
                triggerGameOver();
            }

            if (player.onGround && player.groundBlock !== BLOCK.SPAWN) {
                triggerGameOver();
            }

            const collisionResult = racePath.checkCollisions(player);
            if (collisionResult.scoreIncrease > 0) {
                gameScore += collisionResult.scoreIncrease;
                
                // Ring collection now primarily restores energy
                player.addEnergy(CONFIG.PLAYER.ENERGY_GAIN.RING);
            }
            
            // Note: collisionResult.boostAmount was the old mechanics, we ignore it now 
            // in favor of the manual boost system, or we could add it as small static velocity
            // but the Player class handles the logic inside addEnergy.

            uiManager.hud.update(player, gameScore, dt);
            
            if (dirLight.castShadow) {
                framesSinceShadowUpdate++;
                const distMovedSq = player.position.distanceToSquared(lastShadowPos);
                
                if (distMovedSq > 40000 && framesSinceShadowUpdate > 60) {
                    dirLight.position.x = player.position.x + 50;
                    dirLight.position.z = player.position.z + 50;
                    dirLight.target.position.copy(player.position);
                    dirLight.target.updateMatrixWorld();
                    
                    lastShadowPos.copy(player.position);
                    framesSinceShadowUpdate = 0;
                }
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