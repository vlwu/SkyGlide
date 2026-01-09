import * as THREE from 'three';

export class RacePath {
    constructor(scene) {
        this.scene = scene;
        this.pathLookup = new Map();
        this.curves = [];
        
        // Data for logic
        this.ringData = []; 
        
        // Visuals
        this.visualItems = []; 
        this.instancedMesh = null;
        this.dummy = new THREE.Object3D(); // Helper for matrix calculations
        this.colorHelper = new THREE.Color();

        // Geometry & Material shared for all rings
        this.ringGeometry = new THREE.TorusGeometry(5.0, 0.2, 8, 12); 
        this.ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        
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

        if (this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
            this.instancedMesh.geometry.dispose();
            this.instancedMesh.dispose();
            this.instancedMesh = null;
        }

        this.ringData = [];
        this.curves = [];
        this.pathLookup.clear();
    }

    reset() {
        this.clear();
        this.generate();
    }

    resetRings() {
        // Reactivate all rings
        for (let i = 0; i < this.ringData.length; i++) {
            const data = this.ringData[i];
            data.active = true;
            
            // Reset visual scale
            this.dummy.position.copy(data.position);
            this.dummy.lookAt(data.lookAtTarget);
            
            // Restore boost scale
            const boostScale = 1.0 + (data.boostAmount - 20) * 0.01;
            this.dummy.scale.set(boostScale, boostScale, 1);
            this.dummy.updateMatrix();
            
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
            
            // Restore color
            this.colorHelper.setHex(data.originalColor);
            this.instancedMesh.setColorAt(i, this.colorHelper);
        }
        
        this.instancedMesh.instanceMatrix.needsUpdate = true;
        if (this.instancedMesh.instanceColor) this.instancedMesh.instanceColor.needsUpdate = true;
    }

    generate() {
        const startPos = new THREE.Vector3(0, 15, 0);
        const startDir = new THREE.Vector3(0, 0, -1);
        
        this.createBranch(startPos, startDir, 250, 0);
        this.createVisuals();
        this.spawnRings();
    }

    createBranch(startPos, startDir, segments, depth) {
        const points = [];
        points.push(startPos.clone());
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

            const forcedSplit = (depth === 0 && i === 40);

            if (depth < 3 && (segments - i) > 50) {
                if (forcedSplit || (segmentsSinceBranch > 25 && Math.random() < 0.15)) {
                    const angle = (Math.PI / 5) * (Math.random() > 0.5 ? 1 : -1);
                    const branchDir = currentDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).normalize();
                    this.createBranch(nextPos, branchDir, segments - i, depth + 1);
                    segmentsSinceBranch = 0;
                    if (forcedSplit || Math.random() < 0.2) {
                        const angle2 = -angle * 0.8; 
                        const branchDir2 = currentDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle2).normalize();
                        this.createBranch(nextPos, branchDir2, segments - i, depth + 1);
                    }
                }
            }
        }

        const curve = new THREE.CatmullRomCurve3(points);
        curve.tension = 0.5;
        this.curves.push({ curve, depth }); 

        const length = curve.getLength();
        const divisions = Math.floor(length * 4); 
        const spacedPoints = curve.getSpacedPoints(divisions);

        if (spacedPoints.length > 0) {
            let prevPt = spacedPoints[0];
            this.addToLookup(Math.round(prevPt.z), prevPt);

            for (let i = 1; i < spacedPoints.length; i++) {
                const currPt = spacedPoints[i];
                const prevZ = Math.round(prevPt.z);
                const currZ = Math.round(currPt.z);

                if (prevZ !== currZ) {
                    const step = prevZ > currZ ? -1 : 1;
                    const distZ = currPt.z - prevPt.z;
                    let z = prevZ + step;
                    while (z !== currZ + step) {
                        let t = 0;
                        if (Math.abs(distZ) > 0.0001) t = (z - prevPt.z) / distZ;
                        t = Math.max(0, Math.min(1, t));
                        const interpPt = new THREE.Vector3().lerpVectors(prevPt, currPt, t);
                        interpPt.z = z; 
                        this.addToLookup(z, interpPt);
                        z += step;
                    }
                } else {
                    this.addToLookup(currZ, currPt);
                }
                prevPt = currPt;
            }
        }
    }

    addToLookup(z, point) {
        if (!this.pathLookup.has(z)) this.pathLookup.set(z, []);
        const list = this.pathLookup.get(z);
        if (list.length > 0) {
            const last = list[list.length - 1];
            if (last.distanceToSquared(point) < 1.0) return; 
        }
        list.push(point);
    }

    spawnRings() {
        const tempRings = [];

        for (const { curve, depth } of this.curves) {
            const curveLength = curve.getLength();
            let currentDist = 30;
            
            let ringColor = 0x00ffff; 
            if (depth === 1) ringColor = 0xc000ff; 
            if (depth >= 2) ringColor = 0xff8800;  

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
                } else if (slope < -0.1) {
                    const intensity = Math.min(Math.abs(slope) / 0.6, 1.0);
                    spacing = 70 + (intensity * 60); 
                    boost = 20 - (intensity * 10);   
                }

                const pos = curve.getPointAt(t);
                
                let overlapping = false;
                // Optimization: Simple distance check against last few rings
                for (let i = Math.max(0, tempRings.length - 10); i < tempRings.length; i++) {
                    if (tempRings[i].position.distanceToSquared(pos) < 100) {
                        overlapping = true;
                        break;
                    }
                }

                if (!overlapping) {
                    const finalColor = (boost > 30) ? 0xffffff : ringColor;
                    
                    tempRings.push({
                        position: pos,
                        lookAtTarget: pos.clone().add(tangent),
                        boostAmount: Math.round(boost),
                        originalColor: finalColor,
                        active: true
                    });
                }
                currentDist += spacing;
            }
        }

        // Create Instanced Mesh
        if (tempRings.length > 0) {
            this.instancedMesh = new THREE.InstancedMesh(
                this.ringGeometry, 
                this.ringMaterial, 
                tempRings.length
            );
            
            // Set initial instances
            for (let i = 0; i < tempRings.length; i++) {
                const data = tempRings[i];
                
                this.dummy.position.copy(data.position);
                this.dummy.lookAt(data.lookAtTarget);
                
                // Boost scaling
                const boostScale = 1.0 + (data.boostAmount - 20) * 0.01;
                this.dummy.scale.set(boostScale, boostScale, 1);
                
                this.dummy.updateMatrix();
                this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
                
                this.colorHelper.setHex(data.originalColor);
                this.instancedMesh.setColorAt(i, this.colorHelper);
            }

            this.instancedMesh.instanceMatrix.needsUpdate = true;
            this.scene.add(this.instancedMesh);
            this.ringData = tempRings;
        }
    }

    checkCollisions(player) {
        this._collisionResult.scoreIncrease = 0;
        this._collisionResult.boostAmount = 0;
        
        const pPos = player.position;
        // Optimization: Pre-calculate threshold
        const rangeZ = 6.0; // Rings are thick, give some leeway

        // Iterate data, update InstancedMesh visual if hit
        let meshDirty = false;
        let colorDirty = false;

        for (let i = 0; i < this.ringData.length; i++) {
            const ring = this.ringData[i];
            if (!ring.active) continue;

            // 1D check first (fastest)
            if (Math.abs(pPos.z - ring.position.z) > rangeZ) continue;

            // 3D check
            const distSq = pPos.distanceToSquared(ring.position);
            
            // Radius 5.5 squared = ~30
            if (distSq < 30.25) {
                ring.active = false;
                
                // Update Instance Visuals to "Deactivated" state
                this.instancedMesh.getMatrixAt(i, this.dummy.matrix);
                
                // Shrink
                this.dummy.scale.multiplyScalar(0.1); 
                this.dummy.matrix.compose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);
                this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
                
                // Darken
                this.colorHelper.setHex(0x333333);
                this.instancedMesh.setColorAt(i, this.colorHelper);
                
                meshDirty = true;
                colorDirty = true;

                this._collisionResult.scoreIncrease++;
                this._collisionResult.boostAmount = Math.max(this._collisionResult.boostAmount, ring.boostAmount);
            }
        }

        if (meshDirty) this.instancedMesh.instanceMatrix.needsUpdate = true;
        if (colorDirty && this.instancedMesh.instanceColor) this.instancedMesh.instanceColor.needsUpdate = true;

        return this._collisionResult;
    }

    createVisuals() {
        // Visual generation (Tubes/Particles) remains the same
        // But we add them to this.visualItems for proper cleanup
        for (const { curve } of this.curves) {
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

            // Particles logic kept simple for brevity (assumed identical to before)
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
                fragmentShader: `varying float vAlpha; void main() { if (vAlpha < 0.05) discard; gl_FragColor = vec4(1.0, 0.7, 0.2, vAlpha); }`,
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
        
        // Optimize: We don't need to loop through instances every frame to animate them.
        // We can just rotate the whole InstancedMesh if we center it? 
        // No, they are world space. 
        // To animate rotation of 500 instances individually is expensive on CPU.
        // We skip rotation animation for performance (or do it in vertex shader).
        // Current: Skipping rotation update for raw performance.
    }
}