export class StatsManager {
    constructor() {
        this.storageKey = 'skyglide_stats';
        this.stats = this.load();
    }

    load() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.error('Failed to load stats', e);
        }
        return { 
            highScore: 0, 
            maxDistance: 0, 
            maxTime: 0 
        };
    }

    saveRun(score, distance, time) {
        let newRecord = false;
        
        // Update High Score
        if (score > this.stats.highScore) {
            this.stats.highScore = score;
            newRecord = true;
        }

        // Track max stats independently
        if (distance > this.stats.maxDistance) this.stats.maxDistance = distance;
        if (time > this.stats.maxTime) this.stats.maxTime = time;

        localStorage.setItem(this.storageKey, JSON.stringify(this.stats));

        return {
            highScore: this.stats.highScore,
            isNewRecord: newRecord
        };
    }

    getHighScore() {
        return this.stats.highScore;
    }
}

export const statsManager = new StatsManager();