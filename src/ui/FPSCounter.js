export class FPSCounter {
    constructor() {
        this.container = document.createElement('div');
        this.container.id = 'fps-counter';
        document.body.appendChild(this.container);
        
        this.frames = 0;
        this.lastTime = performance.now();
        this.fps = 0;
    }

    update() {
        this.frames++;
        const time = performance.now();
        
        if (time >= this.lastTime + 500) {
            this.fps = Math.round((this.frames * 1000) / (time - this.lastTime));
            this.lastTime = time;
            this.frames = 0;
            
            // Color coding based on performance
            let color = '#00ff00'; // Green
            if (this.fps < 30) color = '#ff0000'; // Red
            else if (this.fps < 50) color = '#ffff00'; // Yellow
            
            this.container.innerHTML = `<span style="color:${color}">${this.fps}</span> FPS`;
        }
    }
}