var isMobile = false;

// Touuch Screen Controls
const joystickEnabled = true;
const buttonEnabled = false;

// JOYSTICK DOCUMENTATION: https://rexrainbow.github.io/phaser3-rex-notes/docs/site/virtualjoystick/
const rexJoystickUrl = "https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexvirtualjoystickplugin.min.js";

// BUTTON DOCMENTATION: https://rexrainbow.github.io/phaser3-rex-notes/docs/site/button/
const rexButtonUrl = "https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexbuttonplugin.min.js";

// Game Scene
// Game Scene
// Game Scene
class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
        this.trackWidth = 400;
        this.borderStripWidth = 10;
        this.playerStep = 6;
        this.enemies = [];
        this.enemySpeeds = { normal: 3, fast: 5, truck: 2 };
        this.fuel = 100;
        this.fuelDrainRate = 0.02;
        this.score = 0;
        this.level = 1;
        this.spawnDelay = 1200;
        this.enemySpawnEvent = null;
        this.blocks = [];
        this.isGameOver = false;
        this.lives = 2;
        this.policeActive = false;
    }

    preload() {
        this.score = 0;
        this.fuel = 100;
        this.level = 1;
        this.spawnDelay = 1200;
        this.isGameOver = false;
        this.policeActive = false;

        // addEventListenersPhaser.bind(this)(); // Commented out: undefined function
        if (this.sys.game.device.os.desktop) isMobile = false;
        else isMobile = true;

        if (joystickEnabled) this.load.plugin('rexvirtualjoystickplugin', rexJoystickUrl, true);
        if (buttonEnabled) this.load.plugin('rexbuttonplugin', rexButtonUrl, true);
        for (const key in _CONFIG.imageLoader) {
            this.load.image(key, _CONFIG.imageLoader[key]);
        }
        for (const key in _CONFIG.soundsLoader) {
            this.load.audio(key, [_CONFIG.soundsLoader[key]]);
        }
        this.load.image('heart', 'https://aicade-ui-assets.s3.amazonaws.com/GameAssets/icons/heart.png');
        this.load.image("pauseButton", "https://aicade-ui-assets.s3.amazonaws.com/GameAssets/icons/pause.png");
        const fontName = 'pix';
        const fontBaseURL = "https://aicade-ui-assets.s3.amazonaws.com/GameAssets/fonts/";
        this.load.bitmapFont('pixelfont', fontBaseURL + fontName + '.png', fontBaseURL + fontName + '.xml');

        displayProgressLoader.call(this);
    }

    create() {
        this.sounds = {};
        for (const key in _CONFIG.soundsLoader) {
            this.sounds[key] = this.sound.add(key, { loop: false, volume: 0.5 });
        }
        this.sounds.background.setVolume(0.3).setLoop(true).play();

        this.lives = 2;
        this.hearts = [];
        for (let i = 0; i < this.lives; i++) {
            let x = 50 + (i * 35);
            this.hearts[i] = this.add.image(x, 50, "heart").setScale(0.025).setDepth(11);
        }

        // this.vfx = new VFXLibrary(this); // Commented out: undefined class

        this.width = this.game.config.width;
        this.height = this.game.config.height;
        this.add.image(0, 0, 'background').setOrigin(0, 0).setDisplaySize(this.width, this.height);

        // UI elements
        this.scoreText = this.add.bitmapText(this.width - 100, 50, 'pixelfont', '0', 32).setOrigin(1, 0.5).setDepth(11);
        this.fuelText = this.add.bitmapText(this.width - 100, 80, 'pixelfont', 'Fuel: 100', 24).setOrigin(1, 0.5).setDepth(11);
        this.levelText = this.add.bitmapText(this.width - 100, 110, 'pixelfont', 'Level: 1', 24).setOrigin(1, 0.5).setDepth(11);

        this.pauseButton = this.add.sprite(this.width - 60, 60, "pauseButton").setOrigin(0.5, 0.5).setDepth(11);
        this.pauseButton.setInteractive({ cursor: 'pointer' });
        this.pauseButton.setScale(2);
        this.pauseButton.on('pointerdown', () => this.pauseGame());

        if (isMobile) {
            this.joyStick = this.plugins.get('rexvirtualjoystickplugin').add(this, {
                x: 100,
                y: this.height - 100,
                radius: 50,
                base: this.add.circle(0, 0, 80, 0x888888, 0.5).setDepth(11),
                thumb: this.add.circle(0, 0, 40, 0xcccccc, 0.5).setDepth(11),
                dir: '4dir'
            });
            this.joystickKeys = this.joyStick.createCursorKeys();
        }

        // Draw track
        this.add.rectangle(0, 0, (this.width - this.trackWidth) / 2, this.height, 0x008000).setOrigin(0, 0);
        this.add.rectangle(this.width - (this.width - this.trackWidth) / 2, 0, (this.width - this.trackWidth) / 2, this.height, 0x008000).setOrigin(0, 0);
        this.add.rectangle(this.width / 2, this.height / 2, this.trackWidth, this.height, 0x808080);

        this.drawBorder();

        this.player = this.physics.add.sprite(this.width / 2, this.height - 100, 'player').setScale(0.15).setDepth(10);
        this.police = this.physics.add.sprite(this.width / 2, this.height + 50, 'avoidable').setScale(0.15).setDepth(10);

        this.cursors = this.input.keyboard.createCursorKeys();
        this.enemies = this.physics.add.group();
        this.fuelCans = this.physics.add.group();

        this.physics.add.collider(this.player, this.enemies, this.handleCollision, null, this);
        this.physics.add.collider(this.player, this.police, this.resetGame, null, this);
        this.physics.add.overlap(this.player, this.fuelCans, this.collectFuel, null, this);

        this.setupEnemySpawn();
        this.time.addEvent({
            delay: Phaser.Math.Between(4000, 8000),
            callback: this.spawnFuelCan,
            callbackScope: this,
            loop: true
        });

        this.time.addEvent({
            delay: 100,
            callback: () => {
                this.fuel = Math.max(0, this.fuel - this.fuelDrainRate);
                this.fuelText.setText(`Fuel: ${Math.round(this.fuel)}`);
            },
            callbackScope: this,
            loop: true
        });

        this.time.addEvent({
            delay: 20000,
            callback: () => { this.policeActive = true; },
            callbackScope: this,
            loop: false
        });

        this.input.keyboard.on('keydown-ESC', () => this.pauseGame());
        this.toggleControlsVisibility(isMobile);
    }

    toggleControlsVisibility(visibility) {
        if (this.joyStick) {
            this.joyStick.base.visible = visibility;
            this.joyStick.thumb.visible = visibility;
        }
    }

    setupEnemySpawn() {
        if (this.enemySpawnEvent) this.enemySpawnEvent.remove();
        this.enemySpawnEvent = this.time.addEvent({
            delay: this.spawnDelay,
            callback: this.spawnEnemy,
            callbackScope: this,
            loop: true
        });
    }

    adjustDifficulty() {
        this.spawnDelay = Math.max(500, this.spawnDelay - 100);
        this.fuelDrainRate = Math.min(0.05, this.fuelDrainRate + 0.005);
        this.level += 1;
        this.levelText.setText(`Level: ${this.level}`);
        this.setupEnemySpawn();
    }

    drawBorder() {
        const numStripes = Math.ceil(this.height / (this.borderStripWidth * 4)) + 1;
        for (let i = 0; i < numStripes; i++) {
            let y = i * this.borderStripWidth * 4;
            this.blocks.push(this.add.rectangle((this.width - this.trackWidth) / 2, y, this.borderStripWidth, this.borderStripWidth * 2, 0xffffff).setOrigin(0, 0));
            this.blocks.push(this.add.rectangle(this.width - (this.width - this.trackWidth) / 2 - this.borderStripWidth, y, this.borderStripWidth, this.borderStripWidth * 2, 0xffffff).setOrigin(0, 0));
            const laneX1 = this.width / 2 - this.trackWidth / 6;
            const laneX2 = this.width / 2 + this.trackWidth / 6;
            this.blocks.push(this.add.rectangle(laneX1, y, this.borderStripWidth / 2, this.borderStripWidth * 2, 0xffffff).setOrigin(0, 0));
            this.blocks.push(this.add.rectangle(laneX2, y, this.borderStripWidth / 2, this.borderStripWidth * 2, 0xffffff).setOrigin(0, 0));
        }
    }

    update(time, delta) {
        if (!this.isGameOver) {
            this.player.x = Phaser.Math.Clamp(
        this.player.x,
        (this.width - this.trackWidth) / 2 + this.player.displayWidth * this.player.scale / 2 + 20,
        this.width - (this.width - this.trackWidth) / 2 - this.player.displayWidth * this.player.scale / 2 - 20
    );

    this.player.y = Phaser.Math.Clamp(
        this.player.y,
        0 + this.player.displayHeight * this.player.scale / 2 + 20,
        this.height - this.player.displayHeight * this.player.scale / 2 - 20
    );

    if (this.cursors.left.isDown || (this.joystickKeys && this.joystickKeys.left.isDown)) {
        this.player.x -= this.playerStep;
    } else if (this.cursors.right.isDown || (this.joystickKeys && this.joystickKeys.right.isDown)) {
        this.player.x += this.playerStep;
    }

    if (this.cursors.up.isDown || (this.joystickKeys && this.joystickKeys.up.isDown)) {
        this.player.y -= this.playerStep;
    } else if (this.cursors.down.isDown || (this.joystickKeys && this.joystickKeys.down.isDown)) {
        this.player.y += this.playerStep;
    }

            const moveSpeed = 4;
            this.blocks.forEach(block => {
                block.y += moveSpeed;
                if (block.y > this.height) {
                    block.y -= this.height + this.borderStripWidth * 4;
                }
            });

            this.enemies.children.iterate((enemy) => {
                if (enemy) {
                    enemy.y += enemy.getData('speed');
                    if (enemy.y > this.height) {
                        this.enemies.remove(enemy, true, true);
                        this.updateScore(5);
                    }
                }
            });

            this.fuelCans.children.iterate((fuelCan) => {
                if (fuelCan) {
                    fuelCan.y += 3;
                    if (fuelCan.y > this.height) {
                        this.fuelCans.remove(fuelCan, true, true);
                    }
                }
            });

            if (this.policeActive) {
                this.police.y = Math.max(this.police.y - 1.5, this.height - 150);
                this.updatePolicePosition(delta);
            }

            if (this.score >= this.level * 200) {
                this.adjustDifficulty();
            }
        }
    }

    updatePolicePosition(delta) {
        const chaseSpeed = 0.02;
        const distanceToPlayer = this.player.x - this.police.x;
        const minDistance = 10;
        if (Math.abs(distanceToPlayer) > minDistance) {
            this.police.x += chaseSpeed * distanceToPlayer * delta;
        }
        this.police.x = Phaser.Math.Clamp(
            this.police.x,
            (this.width - this.trackWidth) / 2 + this.police.displayWidth * this.player.scale / 2 + 20,
            this.width - (this.width - this.trackWidth) / 2 - this.police.displayWidth * this.player.scale / 2 - 20
        );
    }

    spawnEnemy() {
        const xPosition = Phaser.Math.Between(
            (this.width - this.trackWidth) / 2 + 30,
            this.width - (this.width - this.trackWidth) / 2 - 30
        );
        const enemyTypes = ['enemy', 'truck', 'enemy'];
        const enemyType = enemyTypes[Phaser.Math.Between(0, enemyTypes.length - 1)];
        const speed = this.enemySpeeds[enemyType === 'truck' ? 'truck' : Phaser.Math.Between(0, 1) ? 'normal' : 'fast'];
        const enemy = this.enemies.create(xPosition, -50, enemyType).setScale(0.15);
        enemy.setData('speed', speed);
    }

    spawnFuelCan() {
        const xPosition = Phaser.Math.Between(
            (this.width - this.trackWidth) / 2 + 30,
            this.width - (this.width - this.trackWidth) / 2 - 30
        );
        const fuelCan = this.fuelCans.create(xPosition, -50, 'collectible').setScale(0.1);
        this.tweens.add({
            targets: fuelCan,
            alpha: 0,
            ease: 'Linear',
            duration: 500,
            repeat: -1,
            yoyo: true
        });
    }

    collectFuel(player, fuelCan) {
        this.sounds.collect.setVolume(1).setLoop(false).play();
        fuelCan.destroy();
        this.fuel = Math.min(100, this.fuel + 30);
        this.fuelText.setText(`Fuel: ${Math.round(this.fuel)}`);
        this.updateScore(10);
    }

    handleCollision(player, enemy) {
        this.lives--;
        if (this.lives >= 0) this.hearts[this.lives].destroy();
        this.sounds.damage.setVolume(1).setLoop(false).play();
        // this.vfx.shakeCamera(); // Commented out: undefined VFXLibrary
        enemy.destroy();
        this.tweens.add({
            targets: this.player,
            alpha: 0.5,
            duration: 200,
            yoyo: true,
            repeat: 2
        });
        if (this.lives < 0) this.resetGame();
    }

    resetGame() {
        this.isGameOver = true;
        this.physics.pause();
        this.sounds.background.stop();
        this.sounds.lose.setVolume(1).setLoop(false).play();
        let gameOverText = this.add.bitmapText(this.width / 2, this.height / 2 - 100, 'pixelfont', 'Game Over', 64).setOrigin(0.5);
        this.tweens.add({
            targets: gameOverText,
            scale: { from: 0.5, to: 1.5 },
            alpha: { from: 0, to: 1 },
            ease: 'Elastic.easeOut',
            duration: 1500,
            onComplete: () => {
                this.time.delayedCall(1000, () => {
                    // initiateGameOver.bind(this)({ score: this.score }); // Commented out: undefined function
                    this.scene.restart(); // Fallback: restart the scene
                });
            }
        });
    }

    updateScore(points) {
        // Reduce score gain if fuel is low
        const scoreMultiplier = this.fuel < 20 ? 0.5 : 1;
        this.score += Math.round(points * scoreMultiplier);
        this.scoreText.setText(this.score);
    }

    pauseGame() {
        // handlePauseGame.bind(this)(); // Commented out: undefined function
        this.scene.pause(); // Fallback: pause the scene directly
    }
}

function displayProgressLoader() {
    let width = 320;
    let height = 50;
    let x = (this.game.config.width / 2) - 160;
    let y = (this.game.config.height / 2) - 50;

    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(x, y, width, height);

    const loadingText = this.make.text({
        x: this.game.config.width / 2,
        y: this.game.config.height / 2 + 20,
        text: 'Loading...',
        style: {
            font: '20px monospace',
            fill: '#ffffff'
        }
    }).setOrigin(0.5, 0.5);
    loadingText.setOrigin(0.5, 0.5);

    const progressBar = this.add.graphics();
    this.load.on('progress', (value) => {
        progressBar.clear();
        progressBar.fillStyle(0x364afe, 1);
        progressBar.fillRect(x, y, width * value, height);
    });
    this.load.on('fileprogress', function (file) {
        
    });
    this.load.on('complete', function () {
        progressBar.destroy();
        progressBox.destroy();
        loadingText.destroy();
    });
}

const config = {
    type: Phaser.AUTO,
    width: _CONFIG.orientationSizes[_CONFIG.deviceOrientation].width,
    height: _CONFIG.orientationSizes[_CONFIG.deviceOrientation].height,
    scene: [GameScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        orientation: Phaser.Scale.Orientation.LANDSCAPE
    },
    pixelArt: true,
    physics: {
        default: "arcade",
        arcade: {
            gravity: { y: 0 },
            debug: false,
        },
    },
    dataObject: {
        name: _CONFIG.title,
        description: _CONFIG.description,
        instructions: _CONFIG.instructions,
    },
    deviceOrientation: _CONFIG.deviceOrientation==="landscape"
};