import * as THREE from 'three';
import { CONFIG } from '../config/Config.js';

export class Sky {
    constructor(scene) {
        this.scene = scene;
        
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

        const fragmentShader = `
            uniform vec3 topColor;
            uniform vec3 bottomColor;
            varying vec3 vWorldPosition;

            void main() {
                vec3 dir = normalize(vWorldPosition);
                float h = dir.y;
                vec3 finalColor = mix(bottomColor, topColor, max(h, 0.0));
                float horizon = 1.0 - smoothstep(0.0, 0.2, abs(h));
                finalColor += vec3(0.8, 0.9, 1.0) * horizon * 0.3;
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `;

        const uniforms = {
            topColor: { value: new THREE.Color(CONFIG.GRAPHICS.SKY.TOP_COLOR) },
            bottomColor: { value: new THREE.Color(CONFIG.GRAPHICS.SKY.BOTTOM_COLOR) }
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