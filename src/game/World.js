import * as THREE from 'three';

export class World {
    constructor(scene) {
        this.scene = scene;
        this.obstaclePool = [];
        this.poolSize = 20;
        this.obstacleSpawnZ = -50; // How far ahead to spawn new obstacles

        // Create the pool
        const obstacleGeometry = new THREE.TorusGeometry(2, 0.3, 16, 100);
        // Switched to MeshStandardMaterial to react to light
        const obstacleMaterial = new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.8 });
        for (let i = 0; i < this.poolSize; i++) {
            const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
            this.scene.add(obstacle);
            this.resetObstacle(obstacle);
            this.obstaclePool.push(obstacle);
        }
    }

    // Repositions an obstacle to a new random location ahead of the player
    resetObstacle(obstacle) {
        // Expanded spawn area for true 3D flight
        obstacle.position.x = (Math.random() - 0.5) * 40;
        obstacle.position.y = (Math.random() - 0.5) * 20 + 5;
        obstacle.position.z = this.obstacleSpawnZ - Math.random() * 100;
    }

    update(playerZ) {
        this.obstaclePool.forEach(obstacle => {
            // If an obstacle has gone past the player, reset it
            if (obstacle.position.z > playerZ + 10) {
                this.resetObstacle(obstacle);
            }
        });
    }

    reset() {
        this.obstaclePool.forEach(obstacle => {
            this.resetObstacle(obstacle);
            // Also spread them out initially
            obstacle.position.z -= Math.random() * 50;
        });
    }
}