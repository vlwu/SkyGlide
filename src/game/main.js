import * as THREE from 'three';

let scene, camera, renderer, player;

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

    // A simple cube for the player for now
    const playerGeometry = new THREE.BoxGeometry(1, 1, 1);
    const playerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    player = new THREE.Mesh(playerGeometry, playerMaterial);
    scene.add(player);

    // Initial camera lookAt
    camera.lookAt(player.position);

    // Start the animation loop
    animate();
}

function animate() {
    requestAnimationFrame(animate);

    // Update game logic here
    update();

    renderer.render(scene, camera);
}

function update() {
    // Simple forward movement
    player.position.z -= 0.1;

    // Update camera to follow the player
    camera.position.x = player.position.x;
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