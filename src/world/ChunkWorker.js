import { createNoise3D } from 'simplex-noise';

const noise3D = createNoise3D();

const BLOCK = {
    AIR: 0,
    GRASS: 1,
    STONE: 2,
    SPAWN: 3,
    DIRT: 4,
    SNOW: 5,
    SAND: 6,
    ICE: 7
};

self.onmessage = (e) => {
    const { x, z, size, height } = e.data;
    
    // Create the data array buffer
    const data = new Uint8Array(size * height * size);
    
    const startX = x * size;
    const startZ = z * size;
    
    const scaleBase = 0.02;
    const scaleMount = 0.04;
    const scaleIsland = 0.04;

    for (let lx = 0; lx < size; lx++) {
        for (let lz = 0; lz < size; lz++) {
            const wx = startX + lx;
            const wz = startZ + lz;

            // 1. Terrain Height Calculation
            let h = noise3D(wx * scaleBase, 0, wz * scaleBase) * 15 + 30;
            
            const mountain = noise3D(wx * scaleMount, 100, wz * scaleMount);
            if (mountain > 0) {
                h += mountain * 35;
            }

            const groundHeight = Math.floor(h);

            for (let y = 0; y < height; y++) {
                let blockType = BLOCK.AIR;
                
                if (y <= groundHeight) {
                    blockType = BLOCK.STONE; 
                    const depth = groundHeight - y;
                    
                    if (groundHeight > 58) {
                        if (depth === 0) blockType = BLOCK.SNOW;
                        else if (depth < 3) blockType = BLOCK.STONE;
                    } else if (groundHeight < 22) {
                        if (depth < 3) blockType = BLOCK.SAND;
                    } else {
                        if (depth === 0) blockType = BLOCK.GRASS;
                        else if (depth < 3) blockType = BLOCK.DIRT;
                    }
                }
                else if (y > 45 && y < 90) {
                    const islandNoise = noise3D(wx * scaleIsland, y * scaleIsland, wz * scaleIsland);
                    if (islandNoise > 0.45) {
                        if (y > 80) blockType = BLOCK.ICE;
                        else if (y > 78) blockType = BLOCK.SNOW;
                        else blockType = BLOCK.STONE;
                        
                        if (y < 70 && islandNoise < 0.5 && noise3D(wx * 0.1, y * 0.1, wz * 0.1) > 0) {
                            blockType = BLOCK.GRASS;
                        }
                    }
                }

                if (blockType !== BLOCK.AIR) {
                    // Index calculation: x + y * size + z * size * height
                    // Note: This must match the layout in Chunk.js
                    data[lx + size * (y + height * lz)] = blockType; 
                }
            }
        }
    }

    // Send the heavy data back to main thread
    // We use transferables ([data.buffer]) for zero-copy transfer (instant)
    self.postMessage({ 
        key: `${x},${z}`, 
        data: data 
    }, [data.buffer]);
};