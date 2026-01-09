import * as THREE from 'three';

export class RacePath {
    constructor(scene) {
        this.scene = scene;
        this.pathLookup = new Map();
        
        // Store objects: { curve: CatmullRomCurve3, depth: number }
        this.curves = [];
        
        this.rings = [];
        this.visualItems = []; 

        this.ringGeometry = new THREE.TorusGeometry(5.0, 0.2, 8, 12); 
        this.ringMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff });
        
        this.uniforms = {
            uTime: { value: 0 }
        };
        
        this._collisionResult = { scoreIncrease: 0, boostAmount: 0 };
        
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

        this.curves = [];
        this.pathLookup.clear();
    }

    reset() {
        this.clear();
        this.generate();
    }

    generate() {
        const startPos = new THREE.Vector3(0, 15, 0);
        const startDir = new THREE.Vector3(0, 0, -1);
        
        // Main trunk: 250 segments
        this.createBranch(startPos, startDir, 250, 0);
        
        this.createVisuals();
        this.spawnRings();
    }

    createBranch(startPos, startDir, segments, depth) {
        const points = [];
        
        points.push(startPos.clone());
        // Tangent control point
        const controlPoint = startPos.clone().add(startDir.clone().multiplyScalar(20));
        points.push(controlPoint);

        let currentPos = controlPoint;
        let currentDir = startDir.clone();
        
        let segmentsSinceBranch = 0;

        for (let i = 0; i < segments; i++) {
            const z = currentPos.z - 40; 
            const x = currentPos.x + (Math.random() - 0.5) * 60; 
            let y = currentPos.y + (Math.random() - 0.5) * 30; 
            y = Math.max(20, Math.min(80, y));

            const nextPos = new THREE.Vector3(x, y, z);
            points.push(nextPos);
            
            currentDir.subVectors(nextPos, currentPos).normalize();
            currentPos = nextPos;

            segmentsSinceBranch++;

            // --- BRANCHING LOGIC ---
            // 1. Force a split early on the main path (Depth 0, ~Segment 40) so the user SEES it.
            const forcedSplit = (depth === 0 && i === 40);

            // 2. Random splits
            // Must have remaining length > 50
            // Must have cooled down (25 segments)
            // Depth limit < 3
            if (depth < 3 && (segments - i) > 50) {
                if (forcedSplit || (segmentsSinceBranch > 25 && Math.random() < 0.15)) {
                    
                    // Branch Angle: 35 degrees
                    const angle = (Math.PI / 5) * (Math.random() > 0.5 ? 1 : -1);
                    const branchDir = currentDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).normalize();
                    
                    this.createBranch(nextPos, branchDir, segments - i, depth + 1);
                    segmentsSinceBranch = 0;

                    // 3. Triple Fork Chance (20% or Forced)
                    // If forced split, always make it a triple for spectacle
                    if (forcedSplit || Math.random() < 0.2) {
                        const angle2 = -angle * 0.8; // Opposite side
                        const branchDir2 = currentDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle2).normalize();
                        this.createBranch(nextPos, branchDir2, segments - i, depth + 1);
                    }
                }
            }
        }

        const curve = new THREE.CatmullRomCurve3(points);
        curve.tension = 0.5;
        this.curves.push({ curve, depth }); // Store depth for visuals

        // Populate Lookup
        const length = curve.getLength();
        const divisions = Math.floor(length * 2); 
        const spacedPoints = curve.getSpacedPoints(divisions);

        if (spacedPoints.length > 0) {
            let prevZ = Math.round(spacedPoints[0].z);
            this.addToLookup(prevZ, spacedPoints[0]);

            for (let i = 1; i < spacedPoints.length; i++) {
                const pt = spacedPoints[i];
                const currentZ = Math.round(pt.z);
                const step = prevZ > currentZ ? -1 : 1;
                
                let z = prevZ + step;
                while (z !== currentZ + step) {
                    this.addToLookup(z, pt);
                    z += step;
                }
                prevZ = currentZ;
            }
        }
    }

    addToLookup(z, point) {
        if (!this.pathLookup.has(z)) {
            this.pathLookup.set(z, []);
        }
        const list = this.pathLookup.get(z);
        if (list.length > 0) {
            const last = list[list.length - 1];
            if (last.distanceToSquared(point) < 4) return; 
        }
        list.push(point);
    }

    spawnRings() {
        for (const { curve, depth } of this.curves) {
            const curveLength = curve.getLength();
            let currentDist = 30;
            
            // Branch Color Coding
            let ringColor = 0x00ffff; // Cyan (Main)
            if (depth === 1) ringColor = 0xc000ff; // Purple (Branch 1)
            if (depth >= 2) ringColor = 0xff8800;  // Orange (Branch 2)

            while (currentDist < curveLength - 30) {
                const t = currentDist / curveLength;
                const tangent = curve.getTangentAt(t);
                const slope = tangent.y;

                let spacing = 70;   
                let boost = 20;     

                if (slope > 0.1) {
                    const intensity = Math.min(slope / 0.6, 1.0); 
                    spacing = 70 - (intensity * 40); 
                    boost = 20 + (intensity * 30);   
                } 
                else if (slope < -0.1) {
                    const intensity = Math.min(Math.abs(slope) / 0.6, 1.0);
                    spacing = 70 + (intensity * 60); 
                    boost = 20 - (intensity * 10);   
                }

                const pos = curve.getPointAt(t);
                
                let overlapping = false;
                for (let i = Math.max(0, this.rings.length - 10); i < this.rings.length; i++) {
                    if (this.rings[i].position.distanceToSquared(pos) < 100) {
                        overlapping = true;
                        break;
                    }
                }

                if (!overlapping) {
                    const mat = this.ringMaterial.clone();
                    mat.color.setHex(ringColor);

                    const mesh = new THREE.Mesh(this.ringGeometry, mat);
                    mesh.position.copy(pos);
                    mesh.lookAt(pos.clone().add(tangent));
                    
                    if (boost > 30) {
                        mesh.scale.set(1.2, 1.2, 1.0);
                        mat.color.setHex(0xffffff); // White hot boost
                    } else if (boost < 15) {
                        mesh.scale.set(0.9, 0.9, 1.0);
                    }

                    this.scene.add(mesh);
                    this.rings.push({
                        mesh, position: pos, radius: 5.5, active: true, boostAmount: Math.round(boost)
                    });
                }

                currentDist += spacing;
            }
        }
    }

    checkCollisions(player) {
        this._collisionResult.scoreIncrease = 0;
        this._collisionResult.boostAmount = 0;
        
        const pPos = player.position;

        for (const ring of this.rings) {
            if (!ring.active) continue;

            if (Math.abs(pPos.z - ring.position.z) > 10) continue;

            const distSq = pPos.distanceToSquared(ring.position);
            
            if (distSq < ring.radius * ring.radius) {
                ring.active = false;
                ring.mesh.material.color.setHex(0x333333); 
                ring.mesh.scale.setScalar(0.1); 
                
                this._collisionResult.scoreIncrease++;
                this._collisionResult.boostAmount = Math.max(this._collisionResult.boostAmount, ring.boostAmount);
            }
        }

        return this._collisionResult;
    }

    createVisuals() {
        for (const { curve } of this.curves) {
            // Tube
            const tubeGeo = new THREE.TubeGeometry(curve, 150, 0.2, 6, false);
            
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

            // Particles
            const particleCount = 600; 
            const curvePoints = curve.getSpacedPoints(particleCount);
            
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

            const partMat = new THREE.ShaderMaterial({
                uniforms: this.uniforms,
                vertexShader: `
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
                `,
                fragmentShader: `
                    varying float vAlpha;
                    void main() {
                        if (vAlpha < 0.05) discard;
                        vec3 color = vec3(1.0, 0.7, 0.2); 
                        gl_FragColor = vec4(color, vAlpha);
                    }
                `,
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });

            const particles = new THREE.Points(partGeo, partMat);
            this.scene.add(particles);
            this.visualItems.push(particles);
        }
    }

    getPointsAtZ(z) {
        return this.pathLookup.get(Math.round(z));
    }

    update(dt) {
        this.uniforms.uTime.value += dt;
        const s = 1.0 + Math.sin(this.uniforms.uTime.value * 5) * 0.05;
        for (const ring of this.rings) {
            if (ring.active) {
                const boostScale = 1.0 + (ring.boostAmount - 20) * 0.01;
                ring.mesh.scale.set(s * boostScale, s * boostScale, s);
                ring.mesh.rotation.z += dt; 
            }
        }
    }
}