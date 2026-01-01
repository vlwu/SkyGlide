import * as THREE from 'three';

export class RacePath {
    constructor(scene) {
        this.scene = scene;
        this.points = [];
        this.curve = null;
        
        // Fast lookup: Map<IntegerZ, Vector3>
        // Allows O(1) access to find the track position at any Z coordinate
        this.pathLookup = new Map();
        
        // Configuration
        this.segmentCount = 100; // Increased length for more gameplay
        this.forwardStep = -50; 
        
        this.generate();
    }

    generate() {
        let currentPos = new THREE.Vector3(0, 15, 0);
        this.points.push(currentPos.clone());

        for (let i = 0; i < this.segmentCount; i++) {
            const z = currentPos.z + this.forwardStep;
            const x = currentPos.x + (Math.random() - 0.5) * 80; 
            let y = currentPos.y + (Math.random() - 0.5) * 40; 
            y = Math.max(10, Math.min(50, y));

            const nextPos = new THREE.Vector3(x, y, z);
            this.points.push(nextPos);
            currentPos = nextPos;
        }

        this.curve = new THREE.CatmullRomCurve3(this.points);
        this.curve.tension = 0.5;

        // --- NEW: Generate Lookup Table ---
        // We scan the curve at high resolution and store the positions
        const curveLength = this.curve.getLength();
        const divisions = Math.floor(curveLength); // One point per unit roughly
        const spacedPoints = this.curve.getSpacedPoints(divisions);

        spacedPoints.forEach(point => {
            // We use Math.round to snap to the nearest integer Z
            // This lets the chunk look it up instantly
            this.pathLookup.set(Math.round(point.z), point);
        });

        this.drawDebugLine();
    }

    // The method Chunks will call
    getPointAtZ(z) {
        return this.pathLookup.get(Math.round(z));
    }

    drawDebugLine() {
        const points = this.curve.getPoints(1000);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
        this.scene.add(new THREE.Line(geometry, material));
    }
}