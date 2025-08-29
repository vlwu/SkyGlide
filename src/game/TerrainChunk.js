import * as THREE from 'three';

const FOLIAGE_PROFILES = {
    deciduous_green: {
        leafGeo: new THREE.IcosahedronGeometry(1.8, 0),
        leafMat: new THREE.MeshStandardMaterial({ color: 0x2E7D32, flatShading: true }),
        trunkGeo: new THREE.CylinderGeometry(0.15, 0.2, 3, 5),
        trunkMat: new THREE.MeshStandardMaterial({ color: 0x5D4037, flatShading: true }),
        heightRange: [2.5, 4.0],
        scaleRange: [0.8, 1.2],
    },
    deciduous_autumn: {
        leafGeo: new THREE.IcosahedronGeometry(1.7, 0),
        leafMat: new THREE.MeshStandardMaterial({ color: 0xdb752e, flatShading: true }),
        trunkGeo: new THREE.CylinderGeometry(0.15, 0.2, 2.8, 5),
        trunkMat: new THREE.MeshStandardMaterial({ color: 0x5D4037, flatShading: true }),
        heightRange: [2.2, 3.8],
        scaleRange: [0.7, 1.1],
    },
    pine: {
        leafGeo: new THREE.ConeGeometry(1.5, 4, 6),
        leafMat: new THREE.MeshStandardMaterial({ color: 0x2a553a, flatShading: true }),
        trunkGeo: new THREE.CylinderGeometry(0.2, 0.25, 4, 5),
        trunkMat: new THREE.MeshStandardMaterial({ color: 0x4a3a2a, flatShading: true }),
        heightRange: [3.5, 6.0],
        scaleRange: [0.7, 1.0],
    },
    savanna: {
        leafGeo: new THREE.CylinderGeometry(2.5, 2.0, 0.8, 8),
        leafMat: new THREE.MeshStandardMaterial({ color: 0x98b872, flatShading: true }),
        trunkGeo: new THREE.CylinderGeometry(0.1, 0.15, 3.5, 5),
        trunkMat: new THREE.MeshStandardMaterial({ color: 0x9d8c72, flatShading: true }),
        heightRange: [3.0, 4.5],
        scaleRange: [0.9, 1.1],
    },
};

export class TerrainChunk {
    constructor(scene, xOffset, zOffset) {
        this.scene = scene;
        this.xOffset = xOffset;
        this.zOffset = zOffset;
        this.mesh = null;
        this.waterMesh = null;
    }

    buildMeshes({ positions, colors, foliageData }) {
        const segments = Math.sqrt(positions.length / 3) - 1;
        const size = 200;
        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        geometry.rotateX(-Math.PI / 2);

        const posAttribute = new THREE.BufferAttribute(positions, 3);
        geometry.setAttribute('position', posAttribute);


        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: true,
            metalness: 0.1,
            roughness: 0.9,
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.xOffset, -25, this.zOffset);
        this.scene.add(this.mesh);

        this.generateFoliage(foliageData);
        this.generateWater(size);
    }

    generateWater(size) {
        const waterGeometry = new THREE.PlaneGeometry(size, size, 100, 100);

        const waterMaterial = new THREE.ShaderMaterial({
            uniforms: {
                u_time: { value: 0 },
                u_sunDirection: { value: new THREE.Vector3(0, 1, 0) },
                u_surfaceColor: { value: new THREE.Color(0x60BFFF) },
                u_depthColor: { value: new THREE.Color(0x0A4D8F) },
            },
            vertexShader: `
                uniform float u_time;
                varying vec3 v_worldPosition;
                varying vec3 v_worldNormal;

                void main() {
                    // Calculate world position of the flat vertex
                    vec4 worldPosition_flat = modelMatrix * vec4(position, 1.0);

                    // Calculate wave displacement using world coordinates for seamless tiling
                    // Add a third, smaller, faster, wave for more detail
                    float wave1 = sin(worldPosition_flat.x * 0.05 + u_time * 0.5) * 0.4;
                    float wave2 = sin(worldPosition_flat.z * 0.08 + u_time * 0.8) * 0.4;
                    float wave3 = sin(worldPosition_flat.x * 0.22 + worldPosition_flat.z * 0.15 + u_time * 1.2) * 0.15;
                    float wave_z_offset = wave1 + wave2 + wave3;

                    // Create a new local position with the wave offset
                    vec3 pos = position;
                    pos.z += wave_z_offset;

                    // Final world position includes the wave
                    vec4 finalWorldPosition = modelMatrix * vec4(pos, 1.0);
                    v_worldPosition = finalWorldPosition.xyz;

                    // Calculate normal analytically for correct lighting by taking partial derivatives of the wave function
                    float dW_dx = 0.4 * 0.05 * cos(worldPosition_flat.x * 0.05 + u_time * 0.5) +
                                  0.15 * 0.22 * cos(worldPosition_flat.x * 0.22 + worldPosition_flat.z * 0.15 + u_time * 1.2);
                    float dW_dz = 0.4 * 0.08 * cos(worldPosition_flat.z * 0.08 + u_time * 0.8) +
                                  0.15 * 0.15 * cos(worldPosition_flat.x * 0.22 + worldPosition_flat.z * 0.15 + u_time * 1.2);

                    vec3 worldNormal = normalize(vec3(-dW_dx, 1.0, -dW_dz));
                    v_worldNormal = worldNormal;

                    gl_Position = projectionMatrix * viewMatrix * finalWorldPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 u_sunDirection;
                uniform vec3 u_surfaceColor;
                uniform vec3 u_depthColor;
                varying vec3 v_worldPosition;
                varying vec3 v_worldNormal;

                void main() {
                    vec3 viewDirection = normalize(cameraPosition - v_worldPosition);
                    vec3 normal = normalize(v_worldNormal);

                    // A more pronounced Fresnel effect for a glassy water look
                    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(viewDirection, normal), 0.0), 5.0);

                    // Softer, broader specular highlight
                    vec3 reflection = reflect(-u_sunDirection, normal);
                    float specular = max(0.0, dot(reflection, viewDirection));
                    specular = pow(specular, 48.0) * 0.6;

                    // Color is mixed based on the viewing angle (Fresnel)
                    vec3 waterColor = mix(u_surfaceColor, u_depthColor, fresnel);

                    // Final color with transparency controlled by Fresnel
                    // Slightly more transparent overall
                    gl_FragColor = vec4(waterColor + specular, mix(0.6, 0.95, fresnel));
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
        });

        this.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
        const waterLevel = -25 + (0.22 * 160);
        this.waterMesh.position.set(this.xOffset, waterLevel, this.zOffset);
        this.waterMesh.rotation.x = -Math.PI / 2;
        this.scene.add(this.waterMesh);
    }

    generateFoliage(foliageData) {
        const dummy = new THREE.Object3D();

        for (const profileName in foliageData) {
            if (!FOLIAGE_PROFILES[profileName]) continue;

            const positions = foliageData[profileName];
            const instanceCount = positions.length / 3;
            if (instanceCount === 0) continue;

            const profile = FOLIAGE_PROFILES[profileName];

            const leavesMesh = new THREE.InstancedMesh(profile.leafGeo, profile.leafMat, instanceCount);
            const trunkMesh = new THREE.InstancedMesh(profile.trunkGeo, profile.trunkMat, instanceCount);

            for (let i = 0; i < instanceCount; i++) {
                const x = positions[i * 3];
                const y = positions[i * 3 + 1];
                const z = positions[i * 3 + 2];

                const height = THREE.MathUtils.randFloat(profile.heightRange[0], profile.heightRange[1]);
                const scale = THREE.MathUtils.randFloat(profile.scaleRange[0], profile.scaleRange[1]);
                
                // For leaves
                dummy.position.set(x, y + height, z);
                dummy.scale.set(scale, scale, scale);
                dummy.rotation.y = Math.random() * Math.PI * 2;
                dummy.updateMatrix();
                leavesMesh.setMatrixAt(i, dummy.matrix);

                // For trunks
                dummy.position.set(x, y + height / 2, z);
                dummy.scale.set(1, height / profile.trunkGeo.parameters.height, 1); // Scale trunk height
                dummy.rotation.y = 0; // Keep trunks straight
                dummy.updateMatrix();
                trunkMesh.setMatrixAt(i, dummy.matrix);
            }
            
            leavesMesh.instanceMatrix.needsUpdate = true;
            trunkMesh.instanceMatrix.needsUpdate = true;
            
            this.mesh.add(leavesMesh);
            this.mesh.add(trunkMesh);
        }
    }

    dispose() {
        if (this.mesh) {
            this.mesh.traverse(object => {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(mat => mat.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
            this.scene.remove(this.mesh);
            this.mesh = null;
        }
        if (this.waterMesh) {
            this.waterMesh.geometry.dispose();
            this.waterMesh.material.dispose();
            this.scene.remove(this.waterMesh);
            this.waterMesh = null;
        }
    }
}