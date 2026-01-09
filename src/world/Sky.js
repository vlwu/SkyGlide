import * as THREE from 'three';

export class Sky {
    constructor(scene) {
        this.scene = scene;
        
        // Vertex Shader
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

        // Fragment Shader: High Performance
        // Optimization: Removed expensive per-pixel noise functions.
        // Replaced with a simple vertical gradient and a "horizon glow".
        const fragmentShader = `
            uniform vec3 topColor;
            uniform vec3 bottomColor;
            varying vec3 vWorldPosition;

            void main() {
                vec3 dir = normalize(vWorldPosition);
                float h = dir.y;

                // Simple vertical gradient
                vec3 finalColor = mix(bottomColor, topColor, max(h, 0.0));

                // Add a simple horizon haze band (no noise)
                float horizon = 1.0 - smoothstep(0.0, 0.2, abs(h));
                finalColor += vec3(0.8, 0.9, 1.0) * horizon * 0.3;

                gl_FragColor = vec4(finalColor, 1.0);
            }
        `;

        const uniforms = {
            topColor: { value: new THREE.Color(0x4A6FA5) },
            bottomColor: { value: new THREE.Color(0xA0D0E0) }
        };

        const geometry = new THREE.BoxGeometry(800, 800, 800);
        const material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: THREE.BackSide,
            depthWrite: false // Optimization: Don't write sky depth
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);
    }

    update(dt, playerPos) {
        this.mesh.position.copy(playerPos);
    }
}