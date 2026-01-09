import * as THREE from 'three';

export class Sky {
    constructor(scene) {
        this.scene = scene;
        
        // Vertex Shader: Standard, passes UVs and position
        const vertexShader = `
            varying vec2 vUv;
            varying vec3 vWorldPosition;
            
            void main() {
                vUv = uv;
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `;

        // Fragment Shader: Procedural Pixel Clouds + Gradient
        const fragmentShader = `
            uniform float time;
            uniform vec3 topColor;
            uniform vec3 bottomColor;
            varying vec2 vUv;
            varying vec3 vWorldPosition;

            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                float a = hash(i);
                float b = hash(i + vec2(1.0, 0.0));
                float c = hash(i + vec2(0.0, 1.0));
                float d = hash(i + vec2(1.0, 1.0));
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
            }

            void main() {
                // 1. Sky Gradient (Vertical)
                float h = normalize(vWorldPosition).y;
                // Smooth blend between horizon and zenith
                vec3 skyColor = mix(bottomColor, topColor, pow(max(h, 0.0), 0.8));

                // 2. Cloud Layer
                vec2 cloudUV = vWorldPosition.xz / (vWorldPosition.y + 0.5); 
                cloudUV += time * 0.02;

                float scale = 0.5;
                vec2 pixelUV = floor(cloudUV * scale) / scale;
                
                float n = noise(pixelUV * 3.0);
                
                float cloudMask = step(0.65, n); 
                cloudMask *= smoothstep(0.1, 0.4, h);

                // Clouds are slightly off-white to blend
                vec3 cloudColor = vec3(0.95, 0.98, 1.0);
                vec3 finalColor = mix(skyColor, cloudColor, cloudMask * 0.8);

                gl_FragColor = vec4(finalColor, 1.0);
            }
        `;

        const uniforms = {
            topColor: { value: new THREE.Color(0x4A6FA5) }, // Deeper soft blue
            bottomColor: { value: new THREE.Color(0xA0D0E0) }, // Hazy light blue horizon
            time: { value: 0 }
        };

        const geometry = new THREE.BoxGeometry(800, 800, 800);
        const material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: THREE.BackSide
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);
        this.uniforms = uniforms;
    }

    update(dt, playerPos) {
        this.uniforms.time.value += dt;
        this.mesh.position.copy(playerPos);
    }
}