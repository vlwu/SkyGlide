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

// Scene setup
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(
    CONFIG.GRAPHICS.FOG.COLOR, 
    CONFIG.GRAPHICS.FOG.NEAR, 
    CONFIG.WORLD.RENDER_DISTANCE_UNITS - CONFIG.GRAPHICS.FOG.FAR_OFFSET
); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    powerPreference: "high-performance",
    precision: "mediump",
    stencil: false 
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
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

            const collisionResult = racePath.checkCollisions(player);
            if (collisionResult.scoreIncrease > 0) {
                gameScore += collisionResult.scoreIncrease;
            }
            
            if (collisionResult.boostAmount > 0) {
                player.applyBoost(collisionResult.boostAmount);
            }

            uiManager.hud.update(player, gameScore);
            
            if (time - lastShadowUpdate > 100) {
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