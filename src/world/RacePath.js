import * as THREE from 'three';

export class RacePath {
    constructor(scene) {
        this.scene = scene;
        this.points = [];
        this.curve = null;
        
        this.pathLookup = new Map();
        
        this.segmentCount = 100;
        this.forwardStep = -50; 

        this.rings = [];
        this.visualItems = []; 

        this.ringGeometry = new THREE.TorusGeometry(5.0, 0.2, 8, 12); // Reduced radialSegments from 24 to 12 (Low Poly)
        this.ringMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        
        this.uniforms = {
            uTime: { value: 0 }
        };
        
        // Reusable result object to prevent GC
        this._collisionResult = { scoreIncrease: 0, boosted: false };
        
        this.generate();
    }

    clear() {
        this.visualItems.forEach(item => {
            this.scene.remove(item);
            if (item.geometry) item.geometry.dispose();
            if (item.material) item.material.dispose();
        });
        this.visualItems = [];

        this.rings.forEach(ring => {
            this.scene.remove(ring.mesh);
        });
        this.rings = [];

        this.points = [];
        this.pathLookup.clear();
    }

    reset() {
        this.clear();
        this.generate();
    }

    generate() {
        let currentPos = new THREE.Vector3(0, 15, 0);
        this.points.push(currentPos.clone());

        for (let i = 0; i < this.segmentCount; i++) {
            const z = currentPos.z + this.forwardStep;
            const x = currentPos.x + (Math.random() - 0.5) * 80; 
            let y = currentPos.y + (Math.random() - 0.5) * 40; 
            y = Math.max(20, Math.min(80, y));

            const nextPos = new THREE.Vector3(x, y, z);
            this.points.push(nextPos);
            currentPos = nextPos;
        }

        this.curve = new THREE.CatmullRomCurve3(this.points);
        this.curve.tension = 0.5;

        const curveLength = this.curve.getLength();
        const divisions = Math.floor(curveLength);
        const spacedPoints = this.curve.getSpacedPoints(divisions);

        spacedPoints.forEach(point => {
            this.pathLookup.set(Math.round(point.z), point);
        });

        this.createVisuals();
        this.spawnRings();
    }

    spawnRings() {
        const curveLength = this.curve.getLength();
        
        const createRingAt = (t) => {
            const pos = this.curve.getPointAt(t);
            const tangent = this.curve.getTangentAt(t);

            const mesh = new THREE.Mesh(this.ringGeometry, this.ringMaterial.clone());
            mesh.position.copy(pos);
            mesh.lookAt(pos.clone().add(tangent));
            
            this.scene.add(mesh);
            
            this.rings.push({
                mesh: mesh,
                position: pos,
                radius: 5.5,
                active: true
            });
        };

        const starterDist = 20;
        const starterT = Math.min(starterDist / curveLength, 1.0);
        createRingAt(starterT);

        const count = Math.floor(curveLength / 70);
        for (let i = 1; i < count; i++) {
            const t = i / count;
            if (Math.abs(t - starterT) < 0.02) continue;
            createRingAt(t);
        }
    }

    checkCollisions(player) {
        // Reset result object
        this._collisionResult.scoreIncrease = 0;
        this._collisionResult.boosted = false;
        
        // Optimization: Simple distance check
        // For 100 rings, iterating all is fast enough, provided we don't allocate objects.
        const pPos = player.position;

        for (const ring of this.rings) {
            if (!ring.active) continue;

            // Fast check: Z distance first (most likely to fail)
            if (Math.abs(pPos.z - ring.position.z) > 10) continue;

            // Full distance check
            const distSq = pPos.distanceToSquared(ring.position);
            
            if (distSq < ring.radius * ring.radius) {
                ring.active = false;
                ring.mesh.material.color.setHex(0x333333); 
                ring.mesh.scale.setScalar(0.1); 
                
                this._collisionResult.scoreIncrease++;
                this._collisionResult.boosted = true;
            }
        }

        return this._collisionResult;
    }

    createVisuals() {
        // 1. Tube
        // Optimization: Reduced tubularSegments from 300 to 150
        const tubeGeo = new THREE.TubeGeometry(this.curve, 150, 0.2, 6, false);
        
        const tubeVert = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const tubeFrag = `
            uniform float uTime;
            varying vec2 vUv;
            void main() {
                float t = vUv.x * 3.0 - uTime * 0.5;
                // Simplified color mixing for performance
                vec3 purple = vec3(0.3, 0.0, 0.6);
                vec3 gold   = vec3(1.0, 0.9, 0.3);
                
                float n = sin(t) * 0.5 + 0.5;
                vec3 col = mix(purple, gold, n);

                float alpha = 0.6 + 0.2 * sin(vUv.x * 20.0 - uTime * 2.0);
                gl_FragColor = vec4(col, alpha);
            }
        `;

        const tubeMat = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: tubeVert,
            fragmentShader: tubeFrag,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
        this.scene.add(tubeMesh);
        this.visualItems.push(tubeMesh);


        // 2. Particles
        // Optimization: Reduced count from 4000 to 1500 for low-end devices
        const particleCount = 1500;
        const curvePoints = this.curve.getSpacedPoints(particleCount);
        
        const posArray = new Float32Array(particleCount * 3);
        const randomArray = new Float32Array(particleCount * 3);
        const phaseArray = new Float32Array(particleCount);

        for(let i=0; i<particleCount; i++) {
            const pt = curvePoints[i];
            const theta = Math.random() * Math.PI * 2;

            posArray[i*3] = pt.x + Math.cos(theta) * 0.2;
            posArray[i*3+1] = pt.y + Math.sin(theta) * 0.2;
            posArray[i*3+2] = pt.z;

            randomArray[i*3] = (Math.random() - 0.5) * 4.0;
            randomArray[i*3+1] = (Math.random() - 0.5) * 4.0;
            randomArray[i*3+2] = (Math.random() - 0.5) * 4.0;

            phaseArray[i] = Math.random();
        }

        const partGeo = new THREE.BufferGeometry();
        partGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        partGeo.setAttribute('aRandom', new THREE.BufferAttribute(randomArray, 3));
        partGeo.setAttribute('aPhase', new THREE.BufferAttribute(phaseArray, 1));

        const partVert = `
            uniform float uTime;
            attribute vec3 aRandom;
            attribute float aPhase;
            varying float vAlpha;

            void main() {
                float life = mod(uTime * 0.3 + aPhase, 1.0);
                vec3 newPos = position + aRandom * (life * 3.0);
                vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                vAlpha = 1.0 - smoothstep(0.0, 1.0, life);
                gl_PointSize = (6.0 * vAlpha) * (100.0 / -mvPosition.z);
            }
        `;

        const partFrag = `
            varying float vAlpha;
            void main() {
                // Optimization: Simple square point instead of circle distance calculation
                if (vAlpha < 0.05) discard;
                vec3 color = vec3(1.0, 0.7, 0.2); 
                gl_FragColor = vec4(color, vAlpha);
            }
        `;

        const partMat = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: partVert,
            fragmentShader: partFrag,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const particles = new THREE.Points(partGeo, partMat);
        this.scene.add(particles);
        this.visualItems.push(particles);
    }

    getPointAtZ(z) {
        return this.pathLookup.get(Math.round(z));
    }

    update(dt) {
        this.uniforms.uTime.value += dt;
        
        // Optimization: Only update visible rings? 
        // For now, standard update is fine as simple math is cheap.
        const s = 1.0 + Math.sin(this.uniforms.uTime.value * 5) * 0.05;
        for (const ring of this.rings) {
            if (ring.active) {
                ring.mesh.scale.set(s, s, s);
                ring.mesh.rotation.z += dt; 
            }
        }
    }
}