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

            // Simple pseudo-random hash
            float hash(vec2 p) {
                return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
            }

            // 2D Value Noise for clouds
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
                vec3 skyColor = mix(bottomColor, topColor, max(h, 0.0));

                // 2. Cloud Layer
                // Project UVs onto a virtual plane for the top of the box
                // This prevents clouds from stretching on the sides
                vec2 cloudUV = vWorldPosition.xz / (vWorldPosition.y + 0.5); // Perspective trick
                
                // Animate
                cloudUV += time * 0.02;

                // Pixelate the noise (The "Minecraft" look)
                float scale = 0.5;
                vec2 pixelUV = floor(cloudUV * scale) / scale;
                
                float n = noise(pixelUV * 3.0);
                
                // Cloud Threshold
                float cloudMask = step(0.65, n); // Sharp edges
                
                // Fade clouds near horizon
                cloudMask *= smoothstep(0.1, 0.4, h);

                vec3 finalColor = mix(skyColor, vec3(1.0), cloudMask * 0.8);

                gl_FragColor = vec4(finalColor, 1.0);
            }
        `;

        const uniforms = {
            topColor: { value: new THREE.Color(0x0077ff) },
            bottomColor: { value: new THREE.Color(0x87CEEB) },
            time: { value: 0 }
        };

        const geometry = new THREE.BoxGeometry(800, 800, 800);
        const material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: THREE.BackSide // Render on the inside of the box
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);
        this.uniforms = uniforms;
    }

    update(dt, playerPos) {
        this.uniforms.time.value += dt;
        // Keep the skybox centered on the player
        this.mesh.position.copy(playerPos);
    }
}