export class InputManager {
    constructor(player, gameActions) {
        this.player = player;
        this.gameActions = gameActions;
        this.invertMousePitch = false;
        this.mouseSensitivity = 1.0;

        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('pointerlockchange', this.gameActions.onPointerLockChange, false);
    }

    onMouseMove(event) {
        if (document.pointerLockElement === null) return;
        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        this.player.targetRotation.y -= movementX * 0.002 * this.mouseSensitivity;
        if (this.invertMousePitch) {
            this.player.targetRotation.x += movementY * 0.002 * this.mouseSensitivity;
        } else {
            this.player.targetRotation.x -= movementY * 0.002 * this.mouseSensitivity;
        }
    }

    onKeyDown(event) {
        if (this.gameActions.getGameState() === 'SETTINGS' && event.key === 'Escape') {
            this.gameActions.setGameState('PAUSED');
            return;
        }

        if (event.key === 'Escape') {
            this.gameActions.onTogglePause();
            return;
        }

        const gameState = this.gameActions.getGameState();
        if (gameState === 'PAUSED' || gameState === 'GAME_OVER' || gameState === 'SETTINGS') return;

        if (event.key === 'ArrowLeft') this.player.targetRotation.y += 0.5;
        else if (event.key === 'ArrowRight') this.player.targetRotation.y -= 0.5;
        else if (event.key === 'ArrowUp') this.player.targetRotation.x -= 0.3;
        else if (event.key === 'ArrowDown') this.player.targetRotation.x += 0.3;
    }

    updateSettings(key, value) {
        if (key === 'invertMousePitch') {
            this.invertMousePitch = value;
        } else if (key === 'mouseSensitivity') {
            this.mouseSensitivity = value;
        }
    }
}