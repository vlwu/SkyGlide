import './style.css';
import * as THREE from 'three';
import { WorldManager } from './world/WorldManager.js';
import { RacePath } from './world/RacePath.js';
import { Player } from './Player.js';

// Configuration
const RENDER_DISTANCE = 200;

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 10, RENDER_DISTANCE);

// Camera setup
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);

// Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(50, 100, 50);
scene.add(dirLight);

// Debug helpers
// const gridHelper = new THREE.GridHelper(100, 100);
// scene.add(gridHelper);

// World Generation System
const racePath = new RacePath(scene);
const worldManager = new WorldManager(scene, racePath);

// Player System (Dependent on WorldManager)
const player = new Player(scene, camera, worldManager);

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
  
    const dt = clock.getDelta();

    player.update(dt);
    
    // Update world chunks around player
    worldManager.update(player.position); 

    renderer.render(scene, camera);
}

animate();