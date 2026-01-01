import './style.css';
import * as THREE from 'three';
import { Chunk } from './world/Chunk.js';
import { RacePath } from './world/RacePath.js';
import { Player } from './Player.js';

// --- CONFIGURATION ---
const RENDER_DISTANCE = 200; // Fog distance

// --- 1. SETUP SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky Blue
scene.fog = new THREE.Fog(0x87CEEB, 10, RENDER_DISTANCE);

// --- 2. SETUP CAMERA ---
const camera = new THREE.PerspectiveCamera(
    75, // Field of View
    window.innerWidth / window.innerHeight, // Aspect Ratio
    0.1, // Near clipping plane
    1000 // Far clipping plane
);
camera.position.set(0, 20, 20); // Start high up

// --- 3. SETUP RENDERER ---
const renderer = new THREE.WebGLRenderer({ antialias: true }); // Smooth edges
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel density for performance
document.body.appendChild(renderer.domElement);

// --- 4. LIGHTING ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Soft white light
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8); // Sun light
dirLight.position.set(50, 100, 50);
scene.add(dirLight);

// --- 5. HELPERS (For Debugging) ---
// Grid: size 100, divisions 100
const gridHelper = new THREE.GridHelper(100, 100);
scene.add(gridHelper);

// Axes: X=Red, Y=Green, Z=Blue
const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

// --- 6. CONTROLS ---
const player = new Player(scene, camera);

// --- 7. WORLD GENERATION ---
const racePath = new RacePath(scene);

const chunks = [];
for(let x = -2; x <= 2; x++) {
    for(let z = -5; z <= 1; z++) { 
        chunks.push(new Chunk(x, z, scene, racePath)); 
    }
}

// --- 8. HANDLE RESIZE ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 9. THE GAME LOOP ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
  
    // Get time since last frame
    const dt = clock.getDelta();

    // Update controls
    player.update(dt);

    // Render the scene
    renderer.render(scene, camera);
}

animate();