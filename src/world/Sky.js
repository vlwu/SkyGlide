import * as THREE from 'three';
import { CONFIG } from '../config/Config.js';

export class Sky {
    constructor(scene) {
        this.scene = scene;
        
        // OPTIMIZATION: Generate gradient texture for lookup instead of mixing in shader
        const size = 256;
        const data = new Uint8Array(size * 4);
        const c1 = new THREE.Color(CONFIG.GRAPHICS.SKY.BOTTOM_COLOR);
        const c2 = new THREE.Color(CONFIG.GRAPHICS.SKY.TOP_COLOR);
        const tempColor = new THREE.Color();

        for (let i = 0; i < size; i++) {
            const t = i / (size - 1);
            tempColor.copy(c1).lerp(c2, t);
            data[i * 4] = Math.floor(tempColor.r * 255);
            data[i * 4 + 1] = Math.floor(tempColor.g * 255);
            data[i * 4 + 2] = Math.floor(tempColor.b * 255);
            data[i * 4 + 3] = 255;
        }

        const gradientMap = new THREE.DataTexture(data, 1, size, THREE.RGBAFormat);
        gradientMap.needsUpdate = true;
        gradientMap.minFilter = THREE.LinearFilter;
        gradientMap.magFilter = THREE.LinearFilter;

        const vertexShader = `
            varying vec3 vWorldPosition;
            
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `;

        const fragmentShader = `
            uniform sampler2D uGradient;
            varying vec3 vWorldPosition;

            void main() {
                vec3 dir = normalize(vWorldPosition);
                // Map y (-1 to 1) to texture coord (0 to 1). Clamp bottom to 0
                float t = clamp(dir.y, 0.0, 1.0);
                vec4 texColor = texture2D(uGradient, vec2(0.5, t));
                
                // Horizon Glow
                float horizon = 1.0 - smoothstep(0.0, 0.2, abs(dir.y));
                vec3 finalColor = texColor.rgb + vec3(0.8, 0.9, 1.0) * horizon * 0.3;
                
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `;

        const uniforms = {
            uGradient: { value: gradientMap }
        };

        const geometry = new THREE.BoxGeometry(800, 800, 800);
        const material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: THREE.BackSide,
            depthWrite: false 
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);
    }

    update(dt, playerPos) {
        this.mesh.position.copy(playerPos);
    }
}