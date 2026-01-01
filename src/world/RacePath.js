import * as THREE from 'three';

export class RacePath {
    constructor(scene) {
        this.scene = scene;
        this.points = [];
        this.curve = null;
        
        // Z-coordinate lookup table
        this.pathLookup = new Map();
        
        this.segmentCount = 100;
        this.forwardStep = -50; 
        
        this.generate();
    }

    generate() {
        let currentPos = new THREE.Vector3(0, 15, 0);
        this.points.push(currentPos.clone());

        for (let i = 0; i < this.segmentCount; i++) {
            // Step Z
            const z = currentPos.z + this.forwardStep;
            
            // Apply random offset
            const x = currentPos.x + (Math.random() - 0.5) * 80; 
            let y = currentPos.y + (Math.random() - 0.5) * 40; 
            
            // Clamp height
            y = Math.max(10, Math.min(50, y));

            const nextPos = new THREE.Vector3(x, y, z);
            this.points.push(nextPos);
            currentPos = nextPos;
        }

        this.curve = new THREE.CatmullRomCurve3(this.points);
        this.curve.tension = 0.5;

        // Generate lookup table
        const curveLength = this.curve.getLength();
        const divisions = Math.floor(curveLength);
        const spacedPoints = this.curve.getSpacedPoints(divisions);

        spacedPoints.forEach(point => {
            // Map integer Z to curve point
            this.pathLookup.set(Math.round(point.z), point);
        });

        this.drawDebugLine();
    }

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