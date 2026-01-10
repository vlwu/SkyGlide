import * as THREE from 'three';
import { CONFIG } from '../config/Config.js';
import { settingsManager } from '../settings/SettingsManager.js';
import { vec3Pool } from '../utils/ObjectPool.js';
import { getMaxTerrainHeight, getTerrainHeightMap } from './BiomeUtils.js';

export class RacePath {
    constructor(scene) {
        this.scene = scene;
        this.pathLookup = new Map();
        this.curves = [];
        
        // Data for logic
        this.ringData = [];
        this.ringBuckets = new Map();
        
        // OPTIMIZATION: Reduce bucket size for finer spatial hashing
        this.BUCKET_SIZE = 10;
        
        // Visuals
        this.visualItems = []; 
        
        this._frameCount = 0;

        this.instancedMesh = null;
        this.dummy = new THREE.Object3D(); 
        this.colorHelper = new THREE.Color();

        // Cached Arrays for Collision to avoid GC
        this._activeRings = []; 
        this._lastCollisionBucket = -999999;
        this._lastCheckPos = new THREE.Vector3(0, -999, 0);
        
        // OPTIMIZATION: Object pooling for collision result
        this._collisionResult = { scoreIncrease: 0, boostAmount: 0 };
        
        // OPTIMIZATION: Dirty set for partial GPU updates
        this.dirtyRingIndices = new Set();
        
        this.ringGeometry = new THREE.TorusGeometry(5.0, 0.2, 6, 8); 
        
        this.ringUniforms = {
            uTime: { value: 0 }
        };

        this.ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        
        this.ringMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.uTime = this.ringUniforms.uTime;
            shader.vertexShader = `
                uniform float uTime;
                mat3 rotateZ(float angle) {
                    float c = cos(angle);
                    float s = sin(angle);
                    return mat3(
                        c, -s, 0.0,
                        s,  c, 0.0,
                        0.0, 0.0, 1.0
                    );
                }
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                if (uTime > 0.0) {
                    float angle = uTime * 1.5;
                    transformed = rotateZ(angle) * transformed;
                }
                `
            );
        };

        this.uniforms = {
            uTime: { value: 0 }
        };

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
        
        // Branch limiting
        this.branchCount = 0;
        this.MAX_BRANCHES = 8; 
        
        this.generate();
    }

    hasPath() {
        return this.curves.length > 0;
    }

    clear() {
        this.visualItems.forEach(item => {
            this.scene.remove(item);
            if (item.geometry) item.geometry.dispose();
        });
        this.visualItems = [];

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
        
        this._lastCollisionBucket = -999999;
        this._activeRings.length = 0; 
        
        this.branchCount = 0;
        this.dirtyRingIndices.clear();
    }

    reset() {
        this.clear();
        this.generate();
    }

    resetRings() {
        if (!this.instancedMesh) return;
        this.dirtyRingIndices.clear();

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
        
        // Full update required on reset
        this.instancedMesh.instanceMatrix.needsUpdate = true;
        if (this.instancedMesh.instanceColor) this.instancedMesh.instanceColor.needsUpdate = true;
    }

    generate() {
        // Start alignment with player spawn (Y=36)
        const startPos = new THREE.Vector3(0, 36, 0);
        const startDir = new THREE.Vector3(0, 0, -1);
        
        this.createBranch(startPos, startDir, 250, 0);
        this.createVisuals();
        this.spawnRings();
    }

    createBranch(startPos, startDir, segments, depth) {
        if (this.branchCount >= this.MAX_BRANCHES) {
            return;
        }
        
        this.branchCount++;
        
        const points = [];
        points.push(startPos.clone());
        const controlPoint = startPos.clone().add(startDir.clone().multiplyScalar(20));
        points.push(controlPoint);

        let currentPos = controlPoint;
        let currentDir = startDir.clone();
        let segmentsSinceBranch = 0;

        let verticalBias = (Math.random() > 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.3); 
        let stepsUntilBiasChange = 25 + Math.floor(Math.random() * 35);

        for (let i = 0; i < segments; i++) {
            const dist = Math.abs(currentPos.z);
            const estimatedRings = dist / 70.0;
            
            let varianceMult = 1.0;
            if (estimatedRings >= 10) { 
                const tier = Math.floor((estimatedRings - 10) / 20) + 1;
                varianceMult = 1.5 + (tier * 0.5); 
            }
            
            varianceMult = Math.min(5.0, varianceMult);

            const z = currentPos.z - 40; 
            const xRange = 120 * varianceMult;
            const yRange = 25 * varianceMult; 
            
            const x = currentPos.x + (Math.random() - 0.5) * xRange; 
            
            let yChange = verticalBias * (10 + Math.random() * 15) * (varianceMult * 0.6);
            yChange += (Math.random() - 0.5) * yRange;

            let y = currentPos.y + yChange; 
            
            stepsUntilBiasChange--;
            if (stepsUntilBiasChange <= 0) {
                verticalBias *= -1; 
                stepsUntilBiasChange = 40 + Math.floor(Math.random() * 50); 
                
                if (y > 120) verticalBias = -Math.abs(verticalBias);
                if (y < 50) verticalBias = Math.abs(verticalBias);
            }

            const groundH = getTerrainHeightMap(x, z);
            const maxH = getMaxTerrainHeight(x, z);

            const floorLimit = groundH + 15;
            const ceilingLimit = maxH + 20;

            y = Math.max(floorLimit, Math.min(y, ceilingLimit));

            const nextPos = new THREE.Vector3(x, y, z);
            points.push(nextPos);
            currentDir.subVectors(nextPos, currentPos).normalize();
            currentPos = nextPos;
            segmentsSinceBranch++;

            if (this.branchCount >= this.MAX_BRANCHES) {
                continue; 
            }

            const forcedSplit = (depth === 0 && i === 40);

            if (depth < 2 && (segments - i) > 50) {
                if (forcedSplit || (segmentsSinceBranch > 30 && Math.random() < 0.12)) {
                    const angle = (Math.PI / 5) * (Math.random() > 0.5 ? 1 : -1);
                    const branchDir = currentDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).normalize();
                    this.createBranch(nextPos, branchDir, segments - i, depth + 1);
                    segmentsSinceBranch = 0;
                    
                    if (forcedSplit && this.branchCount < this.MAX_BRANCHES && Math.random() < 0.15) {
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
        // OPTIMIZATION: Cache check if player hasn't moved much
        if (player.position.distanceToSquared(this._lastCheckPos) < 1.0) {
            return this._collisionResult;
        }
        this._lastCheckPos.copy(player.position);

        // RESET POOL and result
        vec3Pool.reset();
        this._collisionResult.scoreIncrease = 0;
        this._collisionResult.boostAmount = 0;
        
        const pPos = player.position;
        const bucketKey = Math.floor(pPos.z / this.BUCKET_SIZE);
        
        if (bucketKey !== this._lastCollisionBucket) {
            this._activeRings.length = 0; 
            
            // Check current and immediate neighbors
            for (let k = bucketKey - 1; k <= bucketKey + 1; k++) {
                const bucket = this.ringBuckets.get(k);
                if (bucket) {
                    for(let i = 0; i < bucket.length; i++) {
                        this._activeRings.push(bucket[i]);
                    }
                }
            }
            this._lastCollisionBucket = bucketKey;
        }

        const ringCount = this._activeRings.length;
        if (ringCount === 0) return this._collisionResult;

        const collisionDistSq = CONFIG.GAME.RINGS.COLLISION_DIST_SQ;

        for (let i = 0; i < ringCount; i++) {
            const ring = this._activeRings[i];
            if (!ring.active) continue;

            // OPTIMIZATION: Z-Filter before distance calc
            if (Math.abs(pPos.z - ring.position.z) > 6.0) continue; 

            const distSq = pPos.distanceToSquared(ring.position);
            if (distSq < collisionDistSq) {
                ring.active = false;
                
                this.dirtyRingIndices.add(ring.index);
                
                this._collisionResult.scoreIncrease++;
                this._collisionResult.boostAmount = Math.max(this._collisionResult.boostAmount, ring.boostAmount);
            }
        }

        return this._collisionResult;
    }

    createVisuals() {
        const POINTS_PER_SEGMENT = 60; 

        // Arrays to aggregate all particles
        const particlePositions = [];
        const particleRandoms = [];
        const particlePhases = [];

        for (const { curve } of this.curves) {
            const curveLength = curve.getLength();
            const totalDivisions = Math.floor(curveLength * 0.5); 
            const allPoints = curve.getSpacedPoints(totalDivisions);

            for (let i = 0; i < allPoints.length - 1; i += POINTS_PER_SEGMENT - 1) {
                const end = Math.min(i + POINTS_PER_SEGMENT, allPoints.length);
                const subset = allPoints.slice(i, end);

                if (subset.length < 2) continue;

                // 1. Tube Visuals
                const subCurve = new THREE.CatmullRomCurve3(subset);
                
                const tubeGeo = new THREE.TubeGeometry(subCurve, subset.length * 2, 0.2, 3, false);
                tubeGeo.computeBoundingBox();

                const tubeMesh = new THREE.Mesh(tubeGeo, this.sharedTubeMat);
                this.scene.add(tubeMesh);
                this.visualItems.push(tubeMesh);

                // 2. Aggregate Particle Data
                const particleCount = Math.floor(subset.length * 0.2); 
                if (particleCount > 0) {
                    const subPoints = subCurve.getSpacedPoints(particleCount);
                    
                    for(let k=0; k<particleCount; k++) {
                        const pt = subPoints[k];
                        const theta = Math.random() * Math.PI * 2;
                        
                        particlePositions.push(
                            pt.x + Math.cos(theta) * 0.2,
                            pt.y + Math.sin(theta) * 0.2,
                            pt.z
                        );
                        
                        particleRandoms.push(
                            (Math.random() - 0.5) * 4.0,
                            (Math.random() - 0.5) * 4.0,
                            (Math.random() - 0.5) * 4.0
                        );
                        
                        particlePhases.push(Math.random());
                    }
                }
            }
        }

        if (particlePositions.length > 0) {
            const partGeo = new THREE.BufferGeometry();
            partGeo.setAttribute('position', new THREE.Float32BufferAttribute(particlePositions, 3));
            partGeo.setAttribute('aRandom', new THREE.Float32BufferAttribute(particleRandoms, 3));
            partGeo.setAttribute('aPhase', new THREE.Float32BufferAttribute(particlePhases, 1));
            
            partGeo.computeBoundingBox();

            const particles = new THREE.Points(partGeo, this.sharedPartMat);
            particles.frustumCulled = false; 
            
            this.scene.add(particles);
            this.visualItems.push(particles);
        }
    }

    getPointsAtZ(z) {
        return this.pathLookup.get(Math.round(z));
    }

    update(dt, playerPos = null) {
        this.uniforms.uTime.value += dt;
        this._frameCount++;

        const quality = settingsManager.get('quality');
        if (quality !== 'LOW') {
            this.ringUniforms.uTime.value += dt;
        }

        // OPTIMIZATION: Batched partial updates with higher limit
        if (this.instancedMesh && this.dirtyRingIndices.size > 0) {
            const MAX_UPDATES_PER_FRAME = 100; // Increased from 10
            let count = 0;

            const dirtyArray = Array.from(this.dirtyRingIndices);

            for (let i = 0; i < Math.min(dirtyArray.length, MAX_UPDATES_PER_FRAME); i++) {
                const idx = dirtyArray[i];
                
                this.dummy.position.set(0, -10000, 0); 
                this.dummy.scale.set(0.001, 0.001, 0.001); 
                this.dummy.updateMatrix();
                this.instancedMesh.setMatrixAt(idx, this.dummy.matrix);
                
                this.colorHelper.setHex(0x000000);
                this.instancedMesh.setColorAt(idx, this.colorHelper);
                
                this.dirtyRingIndices.delete(idx);
                count++;
            }

            if (count > 0) {
                this.instancedMesh.instanceMatrix.needsUpdate = true;
                if (this.instancedMesh.instanceColor) {
                    this.instancedMesh.instanceColor.needsUpdate = true;
                }
            }
        }
    }
}