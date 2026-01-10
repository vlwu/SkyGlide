import * as THREE from 'three';
import { CONFIG } from '../config/Config.js';

export class Sky {
    constructor(scene) {
        this.scene = scene;
        this.totalTime = 0;
        
        // Define palette colors
        this.palette = {
            dayTop: new THREE.Color(CONFIG.GRAPHICS.SKY.DAY_TOP),
            dayBot: new THREE.Color(CONFIG.GRAPHICS.SKY.DAY_BOT),
            setTop: new THREE.Color(CONFIG.GRAPHICS.SKY.SET_TOP),
            setBot: new THREE.Color(CONFIG.GRAPHICS.SKY.SET_BOT),
            nightTop: new THREE.Color(CONFIG.GRAPHICS.SKY.NIGHT_TOP),
            nightBot: new THREE.Color(CONFIG.GRAPHICS.SKY.NIGHT_BOT),
            riseTop: new THREE.Color(CONFIG.GRAPHICS.SKY.RISE_TOP),
            riseBot: new THREE.Color(CONFIG.GRAPHICS.SKY.RISE_BOT)
        };

        this.uniforms = {
            uTopColor: { value: new THREE.Color() },
            uBotColor: { value: new THREE.Color() }
        };

        const vertexShader = `
            varying vec3 vWorldPosition;
            
            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `;

        const fragmentShader = `
            uniform vec3 uTopColor;
            uniform vec3 uBotColor;
            varying vec3 vWorldPosition;

            // Simple random for stars
            float random(vec3 st) {
                return fract(sin(dot(st.xyz, vec3(12.9898,78.233, 45.156))) * 43758.5453123);
            }

            void main() {
                vec3 dir = normalize(vWorldPosition);
                // Map y (-1 to 1) to (0 to 1), clamped
                float t = clamp(dir.y, 0.0, 1.0);
                
                // Procedural gradient mixing
                float mixFactor = pow(t, 0.7);
                vec3 skyColor = mix(uBotColor, uTopColor, mixFactor);
                
                // Horizon Glow
                float horizon = 1.0 - smoothstep(0.0, 0.2, abs(dir.y));
                vec3 glow = uBotColor * horizon * 0.4;
                
                // --- Star Field ---
                // Generate noisy value based on direction
                float starNoise = random(floor(dir * 300.0)); // Tiled direction for varying size
                float starThreshold = 0.985; // Very sparse
                
                // Twinkle/Size Variation
                float starVal = 0.0;
                if (starNoise > starThreshold) {
                    float brightness = (starNoise - starThreshold) / (1.0 - starThreshold);
                    starVal = brightness;
                }

                // Mask stars by sky brightness (stars only visible at night)
                // We use the length of the bottom color as a proxy for day/night brightness
                float skyBrightness = length(uBotColor);
                float nightFactor = 1.0 - smoothstep(0.2, 0.8, skyBrightness);
                
                // Fade stars near horizon
                float starHorizonFade = smoothstep(0.0, 0.3, abs(dir.y));
                
                vec3 starColor = vec3(starVal) * nightFactor * starHorizonFade;

                gl_FragColor = vec4(skyColor + glow + starColor, 1.0);
            }
        `;

        const geometry = new THREE.BoxGeometry(800, 800, 800);
        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: THREE.BackSide,
            depthWrite: false 
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);
        
        // Initialize color
        this.updateColors(0);
    }

    update(dt, playerPos) {
        this.mesh.position.copy(playerPos);
        this.totalTime += dt;
        this.updateColors(this.totalTime);
    }

    updateColors(time) {
        const cycleDuration = CONFIG.GAME.CYCLE_DURATION; 
        const cyclePos = (time % cycleDuration) / cycleDuration; // 0.0 to 1.0
        
        let t;

        if (cyclePos < 0.3) {
            // Day Hold
            this.uniforms.uTopColor.value.copy(this.palette.dayTop);
            this.uniforms.uBotColor.value.copy(this.palette.dayBot);
        } else if (cyclePos < 0.4) {
            // Day -> Sunset
            t = (cyclePos - 0.3) / 0.1;
            this.uniforms.uTopColor.value.copy(this.palette.dayTop).lerp(this.palette.setTop, t);
            this.uniforms.uBotColor.value.copy(this.palette.dayBot).lerp(this.palette.setBot, t);
        } else if (cyclePos < 0.7) {
            // Night Hold
            if (cyclePos < 0.5) {
                t = (cyclePos - 0.4) / 0.1;
                this.uniforms.uTopColor.value.copy(this.palette.setTop).lerp(this.palette.nightTop, t);
                this.uniforms.uBotColor.value.copy(this.palette.setBot).lerp(this.palette.nightBot, t);
            } else {
                this.uniforms.uTopColor.value.copy(this.palette.nightTop);
                this.uniforms.uBotColor.value.copy(this.palette.nightBot);
            }
        } else if (cyclePos < 0.8) {
            // Night -> Sunrise
            t = (cyclePos - 0.7) / 0.1;
            this.uniforms.uTopColor.value.copy(this.palette.nightTop).lerp(this.palette.riseTop, t);
            this.uniforms.uBotColor.value.copy(this.palette.nightBot).lerp(this.palette.riseBot, t);
        } else {
            // Sunrise -> Day
            t = (cyclePos - 0.8) / 0.2;
            this.uniforms.uTopColor.value.copy(this.palette.riseTop).lerp(this.palette.dayTop, t);
            this.uniforms.uBotColor.value.copy(this.palette.riseBot).lerp(this.palette.dayBot, t);
        }

        // Sync fog color
        if (this.scene.fog) {
            this.scene.fog.color.copy(this.uniforms.uBotColor.value);
        }
    }
}