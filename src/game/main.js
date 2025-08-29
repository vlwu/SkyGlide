import * as THREE from 'three';

let scene, camera, renderer, player;
let targetPlayerX = 0; // Target X position for the player, controlled by mouse/keys

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10); // Positioned behind the player

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('game-container').appendChild(renderer.domElement);

    // Rhombus-like shape for the player
    const playerGeometry = new THREE.OctahedronGeometry(0.7); // Using Octahedron for a diamond/rhombus shape
    const playerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    player = new THREE.Mesh(playerGeometry, playerMaterial);
    player.scale.set(2, 0.6, 1); // Scale it to look more like a glider
    scene.add(player);

    // Initial camera lookAt
    camera.lookAt(player.position);

    // Add event listeners for controls
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown', onKeyDown);

    // Start the animation loop
    animate();

    // Fade out the intro overlay
    const introOverlay = document.getElementById('intro-overlay');
    if (introOverlay) {
        setTimeout(() => {
            introOverlay.style.opacity = '0';
            // Remove from DOM after transition to prevent interaction
            setTimeout(() => introOverlay.style.display = 'none', 1500);
        }, 500); // Start fade after a short delay
    }
}

function onMouseMove(event) {
    // Convert mouse position to a normalized value (-1 to 1) and then to world coordinates
    const mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    targetPlayerX = mouseX * 10; // Scale to fit the game world's horizontal range
}

function onKeyDown(event) {
    const moveDistance = 2; // How much the player moves with arrow keys
    if (event.key === 'ArrowLeft') {
        targetPlayerX -= moveDistance;
    } else if (event.key === 'ArrowRight') {
        targetPlayerX += moveDistance;
    }
}

function animate() {
    requestAnimationFrame(animate);

    // Update game logic here
    update();

    renderer.render(scene, camera);
}

function update() {
    // Simple forward movement
    player.position.z -= 0.15; // Increased speed slightly for a more dynamic feel

    // Smoothly move player horizontally towards the target position (lerp)
    player.position.x = THREE.MathUtils.lerp(player.position.x, targetPlayerX, 0.1);

    // Update camera to follow the player
    // The camera's x position also lerps for a smoother follow effect
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, player.position.x, 0.1);
    camera.position.y = player.position.y + 2; // Slightly above
    camera.position.z = player.position.z + 5; // Behind
}

// Handle window resizing
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();