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

        this.uniforms = {
            uTime: { value: 0 }
        };
        
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

        this.createVisuals();
    }

    createVisuals() {
        // --- 1. Glowing Tube ---
        const tubeGeo = new THREE.TubeGeometry(this.curve, 300, 0.2, 8, false);
        
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

            // Cosine based palette, similar to IQ's palettes
            vec3 palette(float t) {
                vec3 a = vec3(0.5, 0.5, 0.5);
                vec3 b = vec3(0.5, 0.5, 0.5);
                vec3 c = vec3(1.0, 1.0, 1.0);
                vec3 d = vec3(0.263, 0.416, 0.557); // Colors offset
                return a + b * cos(6.28318 * (c * t + d));
            }

            void main() {
                // Animate along the path
                float t = vUv.x * 3.0 - uTime * 0.5;
                
                // Sunset Gradient Colors
                vec3 purple = vec3(0.3, 0.0, 0.6);
                vec3 pink   = vec3(1.0, 0.2, 0.5);
                vec3 orange = vec3(1.0, 0.6, 0.1);
                vec3 gold   = vec3(1.0, 0.9, 0.3);

                // Fluid mixing
                float n = sin(t) * 0.5 + 0.5;
                float n2 = cos(t * 1.3 + uTime) * 0.5 + 0.5;
                
                vec3 col = mix(purple, pink, n);
                col = mix(col, orange, n2);
                col = mix(col, gold, pow(n * n2, 2.0)); // Highlights

                // Pulse alpha
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


        // --- 2. Streaming Particles ---
        const particleCount = 4000;
        // Sample points along curve
        const curvePoints = this.curve.getSpacedPoints(particleCount);
        
        const posArray = new Float32Array(particleCount * 3);
        const randomArray = new Float32Array(particleCount * 3);
        const phaseArray = new Float32Array(particleCount);

        for(let i=0; i<particleCount; i++) {
            const pt = curvePoints[i];
            
            // Random offset from center to create volume
            const theta = Math.random() * Math.PI * 2;
            const r = 0.5 + Math.random() * 2.0; // Spread out a bit

            posArray[i*3] = pt.x + Math.cos(theta) * 0.2;
            posArray[i*3+1] = pt.y + Math.sin(theta) * 0.2;
            posArray[i*3+2] = pt.z;

            // Drift direction
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
                // Cycle 0..1
                float life = mod(uTime * 0.3 + aPhase, 1.0);
                
                // Drift outward
                vec3 newPos = position + aRandom * (life * 3.0);
                
                vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
                gl_Position = projectionMatrix * mvPosition;

                // Fade out at end of life
                vAlpha = 1.0 - smoothstep(0.0, 1.0, life);
                
                // Size attenuation
                gl_PointSize = (6.0 * vAlpha) * (100.0 / -mvPosition.z);
            }
        `;

        const partFrag = `
            varying float vAlpha;
            void main() {
                // Circle shape
                vec2 center = gl_PointCoord - vec2(0.5);
                float dist = length(center);
                if (dist > 0.5) discard;

                // Glowing orange/gold color
                vec3 color = mix(vec3(1.0, 0.5, 0.0), vec3(1.0, 0.9, 0.5), vAlpha);
                
                // Soft edge
                float alpha = vAlpha * (1.0 - smoothstep(0.3, 0.5, dist));
                
                gl_FragColor = vec4(color, alpha);
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
    }

    getPointAtZ(z) {
        return this.pathLookup.get(Math.round(z));
    }

    update(dt) {
        this.uniforms.uTime.value += dt;
    }
}