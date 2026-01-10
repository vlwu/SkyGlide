import * as THREE from 'three';

export class RacePath {
    constructor(scene) {
        this.scene = scene;
        this.pathLookup = new Map();
        this.curves = [];
        
        // Data for logic
        this.ringData = [];
        this.ringBuckets = new Map();
        this.BUCKET_SIZE = 50;
        
        // Visuals
        this.visualItems = []; 
        this.visualBuckets = new Map();
        this.VISUAL_BUCKET_SIZE = 100;
        
        this._visibleItems = [];
        this._frameCount = 0;

        this.instancedMesh = null;
        this.dummy = new THREE.Object3D(); 
        this.colorHelper = new THREE.Color();

        this.ringGeometry = new THREE.TorusGeometry(5.0, 0.2, 8, 12); 
        this.ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        
        this.uniforms = {
            uTime: { value: 0 }
        };

        // OPTIMIZATION: Create shared materials once.
        this.sharedTubeMat = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
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
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.sharedPartMat = new THREE.ShaderMaterial({
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
        
        this._collisionResult = { scoreIncrease: 0, boostAmount: 0 };
        
        this.generate();
    }

    hasPath() {
        return this.curves.length > 0;
    }

    clear() {
        this.visualItems.forEach(item => {
            this.scene.remove(item);
            if (item.geometry) item.geometry.dispose();
            // Do NOT dispose the shared material
        });
        this.visualItems = [];
        this.visualBuckets.clear();
        this._visibleItems = [];

        if (this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
            this.instancedMesh.geometry.dispose();
            this.instancedMesh.dispose();
            this.instancedMesh = null;
        }

        this.ringData = [];
        this.ringBuckets.clear();
        this.curves = [];
        this.pathLookup.clear();
    }

    reset() {
        this.clear();
        this.generate();
    }

    resetRings() {
        if (!this.instancedMesh) return;

        for (let i = 0; i < this.ringData.length; i++) {
            const data = this.ringData[i];
            data.active = true;
            
            this.dummy.position.copy(data.position);
            this.dummy.lookAt(data.lookAtTarget);
            
            const boostScale = 1.0 + (data.boostAmount - 20) * 0.01;
            this.dummy.scale.set(boostScale, boostScale, 1);
            this.dummy.updateMatrix();
            
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
            
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
        // OPTIMIZATION: Reduced sampling resolution
        const divisions = Math.floor(length * 2); 
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
            if (last.distanceToSquared(point) < 0.25) return; 
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
                for (let i = Math.max(0, tempRings.length - 10); i < tempRings.length; i++) {
                    if (tempRings[i].position.distanceToSquared(pos) < 100) {
                        overlapping = true;
                        break;
                    }
                }

                if (!overlapping) {
                    const finalColor = (boost > 30) ? 0xffffff : ringColor;
                    
                    const ring = {
                        position: pos,
                        lookAtTarget: pos.clone().add(tangent),
                        boostAmount: Math.round(boost),
                        originalColor: finalColor,
                        active: true,
                        index: tempRings.length
                    };
                    
                    tempRings.push(ring);
                    
                    const bucketKey = Math.floor(pos.z / this.BUCKET_SIZE);
                    if (!this.ringBuckets.has(bucketKey)) this.ringBuckets.set(bucketKey, []);
                    this.ringBuckets.get(bucketKey).push(ring);
                }
                currentDist += spacing;
            }
        }

        if (tempRings.length > 0) {
            this.instancedMesh = new THREE.InstancedMesh(
                this.ringGeometry, 
                this.ringMaterial, 
                tempRings.length
            );
            
            for (let i = 0; i < tempRings.length; i++) {
                const data = tempRings[i];
                this.dummy.position.copy(data.position);
                this.dummy.lookAt(data.lookAtTarget);
                const boostScale = 1.0 + (data.boostAmount - 20) * 0.01;
                this.dummy.scale.set(boostScale, boostScale, 1);
                this.dummy.updateMatrix();
                this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
                this.colorHelper.setHex(data.originalColor);
                this.instancedMesh.setColorAt(i, this.colorHelper);
            }

            this.instancedMesh.instanceMatrix.needsUpdate = true;
            this.instancedMesh.frustumCulled = false; 
            this.scene.add(this.instancedMesh);
            this.ringData = tempRings;
        }
    }

    checkCollisions(player) {
        this._collisionResult.scoreIncrease = 0;
        this._collisionResult.boostAmount = 0;
        
        const pPos = player.position;
        const bucketKey = Math.floor(pPos.z / this.BUCKET_SIZE);
        
        let meshDirty = false;
        let colorDirty = false;

        for (let k = bucketKey - 1; k <= bucketKey + 1; k++) {
            const bucket = this.ringBuckets.get(k);
            if (!bucket) continue;

            for (let i = 0; i < bucket.length; i++) {
                const ring = bucket[i];
                if (!ring.active) continue;

                const distSq = pPos.distanceToSquared(ring.position);
                if (distSq < 30.25) {
                    ring.active = false;
                    const idx = ring.index;
                    this.instancedMesh.getMatrixAt(idx, this.dummy.matrix);
                    this.dummy.scale.multiplyScalar(0.1); 
                    this.dummy.matrix.compose(this.dummy.position, this.dummy.quaternion, this.dummy.scale);
                    this.instancedMesh.setMatrixAt(idx, this.dummy.matrix);
                    this.colorHelper.setHex(0x333333);
                    this.instancedMesh.setColorAt(idx, this.colorHelper);
                    meshDirty = true;
                    colorDirty = true;
                    this._collisionResult.scoreIncrease++;
                    this._collisionResult.boostAmount = Math.max(this._collisionResult.boostAmount, ring.boostAmount);
                }
            }
        }

        if (meshDirty) this.instancedMesh.instanceMatrix.needsUpdate = true;
        if (colorDirty && this.instancedMesh.instanceColor) this.instancedMesh.instanceColor.needsUpdate = true;

        return this._collisionResult;
    }

    createVisuals() {
        for (const { curve } of this.curves) {
            // OPTIMIZATION: Reduced Segments
            const curveLength = curve.getLength();
            const segments = Math.floor(curveLength * 0.5); 

            // OPTIMIZATION: Reduced Radial Segments
            const tubeGeo = new THREE.TubeGeometry(curve, segments, 0.2, 4, false);
            tubeGeo.computeBoundingBox();

            // Use shared material
            const tubeMesh = new THREE.Mesh(tubeGeo, this.sharedTubeMat);
            tubeMesh.userData.bbox = tubeGeo.boundingBox;
            this.scene.add(tubeMesh);
            this.addToVisualBucket(tubeMesh);

            // Particles
            // OPTIMIZATION: Reduced particle density
            const particleCount = Math.floor(curveLength * 0.2); 
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
            
            partGeo.computeBoundingBox();

            // Use shared material
            const particles = new THREE.Points(partGeo, this.sharedPartMat);
            particles.userData.bbox = partGeo.boundingBox;
            this.scene.add(particles);
            this.addToVisualBucket(particles);
        }
    }

    addToVisualBucket(item) {
        if (!item.userData.bbox) {
            this.visualItems.push(item);
            return;
        }
        
        const minBucket = Math.floor(item.userData.bbox.min.z / this.VISUAL_BUCKET_SIZE);
        const maxBucket = Math.floor(item.userData.bbox.max.z / this.VISUAL_BUCKET_SIZE);

        for (let b = minBucket; b <= maxBucket; b++) {
            if (!this.visualBuckets.has(b)) this.visualBuckets.set(b, []);
            this.visualBuckets.get(b).push(item);
        }
    }

    getPointsAtZ(z) {
        return this.pathLookup.get(Math.round(z));
    }

    update(dt, playerPos = null) {
        this.uniforms.uTime.value += dt;
        this._frameCount++;

        if (playerPos) {
            // OPTIMIZATION: Tighter visual culling
            // Match the chunk render distance (approx 200 units)
            const RENDER_DIST = 220; 
            
            const centerBucket = Math.floor(playerPos.z / this.VISUAL_BUCKET_SIZE);
            // Only look 1 bucket behind and 2 buckets ahead (was 3 and 3)
            const minB = centerBucket - 1; 
            const maxB = centerBucket + 2; 
            
            const currentFrame = this._frameCount;
            const visibleNow = [];

            for (let b = minB; b <= maxB; b++) {
                const bucket = this.visualBuckets.get(b);
                if (bucket) {
                    for (let i = 0; i < bucket.length; i++) {
                        const item = bucket[i];
                        if (item.userData.bbox) {
                            // Fast Z check
                            const midZ = (item.userData.bbox.min.z + item.userData.bbox.max.z) * 0.5;
                            if (Math.abs(midZ - playerPos.z) > RENDER_DIST) continue;

                            if (!item.visible) item.visible = true;
                            item.userData.lastFrame = currentFrame;
                            visibleNow.push(item);
                        }
                    }
                }
            }

            for (let i = 0; i < this._visibleItems.length; i++) {
                const item = this._visibleItems[i];
                if (item.userData.lastFrame !== currentFrame) {
                    item.visible = false;
                }
            }
            this._visibleItems = visibleNow;
        }
    }
}