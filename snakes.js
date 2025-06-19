
    var isMobile = false;

    // Touuch Screen Controls
    const joystickEnabled = true;
    const buttonEnabled = false;

    // JOYSTICK DOCUMENTATION: https://rexrainbow.github.io/phaser3-rex-notes/docs/site/virtualjoystick/
    const rexJoystickUrl = "https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexvirtualjoystickplugin.min.js";

    // BUTTON DOCMENTATION: https://rexrainbow.github.io/phaser3-rex-notes/docs/site/button/
    const rexButtonUrl = "https://raw.githubusercontent.com/rexrainbow/phaser3-rex-notes/master/dist/rexbuttonplugin.min.js";

    // Game Scene
    class GameScene extends Phaser.Scene {
        constructor() {
            super({ key: 'GameScene' });
        }

        preload() {
            for (const key in _CONFIG.imageLoader) this.load.image(key, _CONFIG.imageLoader[key]);
            for (const key in _CONFIG.soundsLoader) this.load.audio(key, [_CONFIG.soundsLoader[key]]);

            this.score = 0;

            addEventListenersPhaser.bind(this)();

            if (joystickEnabled) this.load.plugin('rexvirtualjoystickplugin', rexJoystickUrl, true);
            if (buttonEnabled) this.load.plugin('rexbuttonplugin', rexButtonUrl, true);

            this.load.image("pauseButton", "https://aicade-ui-assets.s3.amazonaws.com/GameAssets/icons/pause.png");
            this.load.image("pillar", "https://aicade-ui-assets.s3.amazonaws.com/GameAssets/textures/Bricks/s2+Brick+01+Grey.png");

            const fontName = 'pix';
            const fontBaseURL = "https://aicade-ui-assets.s3.amazonaws.com/GameAssets/fonts/";
            this.load.bitmapFont('pixelfont', fontBaseURL + fontName + '.png', fontBaseURL + fontName + '.xml');

            displayProgressLoader.call(this);
        }

        create() {
            isMobile = !this.sys.game.device.os.desktop;

            this.sounds = {};
            for (const key in _CONFIG.soundsLoader) {
                this.sounds[key] = this.sound.add(key, { loop: false, volume: 0.5 });
            }
            this.sounds.background.setVolume(1).setLoop(false).play();

            this.vfx = new VFXLibrary(this);
            this.width = this.game.config.width;
            this.height = this.game.config.height;

            this.bg = this.add.image(this.width / 2, this.height / 2, "background").setOrigin(0.5);
            const scale = Math.max(this.width / this.bg.displayWidth, this.height / this.bg.displayHeight);
            this.bg.setScale(scale).setDepth(-5);

            this.scoreText = this.add.bitmapText(40, 40, 'pixelfont', '0', 64).setOrigin(0.5).setDepth(11);

            this.input.keyboard.on('keydown-ESC', () => this.pauseGame());
            this.pauseButton = this.add.sprite(this.width - 60, 60, "pauseButton").setInteractive({ cursor: 'pointer' }).setScale(3);
            this.pauseButton.on('pointerdown', () => this.pauseGame());

            if (joystickEnabled) {
                this.joyStick = this.plugins.get('rexvirtualjoystickplugin').add(this, {
                    x: 100, y: this.height - 100,
                    radius: 50,
                    base: this.add.circle(0, 0, 80, 0x888888, 0.5),
                    thumb: this.add.circle(0, 0, 40, 0xcccccc, 0.5),
                    dir: '8dir'
                });
                this.joystickKeys = this.joyStick.createCursorKeys();
            }

            this.lastMoveTime = 0;
            this.moveInterval = 150;
            this.tileSize = 50;
            this.snakeDirection = Phaser.Math.Vector2.RIGHT;
            this.snakeBody = [];
            this.isGameOver = false;

            this.snakeBody.push(
                this.add.sprite(50, 50, 'player').setDisplaySize(this.tileSize, this.tileSize).setOrigin(0).setDepth(12)
            );

            this.apple = this.add.sprite(0, 0, 'collectible_2').setDisplaySize(this.tileSize, this.tileSize).setOrigin(0).setDepth(15);
            this.vfx.addGlow(this.apple, .9);
            this.vfx.scaleGameObject(this.apple, 1.1, 500);
            this.positionapple();

            this.enemies = this.add.group(); // 👈 new: group of enemies
            this.spawnEnemy(); // spawn first one

            this.setupKeyboardInputs();
            this.toggleControlsVisibility(isMobile);
            this.input.keyboard.disableGlobalCapture();
        }

        toggleControlsVisibility(visible) {
            if (this.joyStick) {
                this.joyStick.base.visible = visible;
                this.joyStick.thumb.visible = visible;
            }
        }

        update(time) {
            if (!this.isGameOver && time >= this.lastMoveTime + this.moveInterval) {
                this.lastMoveTime = time;
                this.move();
            }
        }

        move() {
            if (this.joystickKeys.left.isDown) this.snakeDirection = Phaser.Math.Vector2.LEFT;
            else if (this.joystickKeys.right.isDown) this.snakeDirection = Phaser.Math.Vector2.RIGHT;
            else if (this.joystickKeys.up.isDown) this.snakeDirection = Phaser.Math.Vector2.UP;
            else if (this.joystickKeys.down.isDown) this.snakeDirection = Phaser.Math.Vector2.DOWN;

            let newX = this.snakeBody[0].x + this.snakeDirection.x * this.tileSize;
            let newY = this.snakeBody[0].y + this.snakeDirection.y * this.tileSize;

            // 🍏 Apple Collision
            if (newX === this.apple.x && newY === this.apple.y) {
                const last = this.snakeBody[this.snakeBody.length - 1];
                this.snakeBody.push(
                    this.add.sprite(last.x, last.y, 'collectible_1').setDisplaySize(this.tileSize, this.tileSize).setOrigin(0)
                );

                this.sounds.damage.setVolume(0.75).setLoop(false).play();

                const emitter = this.add.particles(this.snakeBody[0].x, this.snakeBody[0].y, 'bubbles', {
                    speed: { min: -100, max: 300 },
                    scale: { start: .2, end: 0 },
                    blendMode: 'MULTIPLY',
                    lifespan: 750,
                    tint: 0xfafafa
                });
                emitter.explode(70);

                const pointsText = this.add.bitmapText(newX, newY, 'pixelfont', '+10', 45).setOrigin(0.5);
                this.tweens.add({
                    targets: pointsText,
                    y: pointsText.y - 50,
                    alpha: 0,
                    ease: 'Linear',
                    duration: 1000,
                    onComplete: () => pointsText.destroy()
                });

                this.positionapple();
                this.spawnEnemy(); // 👈 new: spawn another enemy
                this.updateScore(10);
                this.moveInterval = Math.max(50, this.moveInterval - 5);
            }

            // ☠️ Collision with any enemy
            this.enemies.getChildren().forEach(enemy => {
                if (newX === enemy.x && newY === enemy.y) {
                    this.gameOverEffect(enemy);
                    this.isGameOver = true;
                }
            });

            // Move body segments
            for (let i = this.snakeBody.length - 1; i > 0; i--) {
                this.snakeBody[i].x = this.snakeBody[i - 1].x;
                this.snakeBody[i].y = this.snakeBody[i - 1].y;
            }

            this.snakeBody[0].x = newX;
            this.snakeBody[0].y = newY;

            this.checkthisOver();
        }

        spawnEnemy() {
            const enemy = this.add.sprite(0, 0, 'avoidable')
                .setDisplaySize(this.tileSize, this.tileSize)
                .setOrigin(0).setDepth(10);

            this.vfx.scaleGameObject(enemy, 1.1, 500);
            enemy.x = Math.floor(Math.random() * (this.width / this.tileSize)) * this.tileSize;
            enemy.y = Math.floor(Math.random() * (this.height / this.tileSize)) * this.tileSize;

            this.enemies.add(enemy);
        }

        positionapple() {
            this.apple.x = Math.floor(Math.random() * (this.width / this.tileSize)) * this.tileSize;
            this.apple.y = Math.floor(Math.random() * (this.height / this.tileSize)) * this.tileSize;
        }

        setupKeyboardInputs() {
    const cursors = this.input.keyboard.createCursorKeys();

    // Create WASD keys
    this.wasdKeys = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D
    });

    this.input.keyboard.on('keydown', () => {
        const dir = this.snakeDirection;

        if ((cursors.left.isDown || this.wasdKeys.left.isDown) && dir !== Phaser.Math.Vector2.RIGHT) {
            this.snakeDirection = Phaser.Math.Vector2.LEFT;
        } else if ((cursors.right.isDown || this.wasdKeys.right.isDown) && dir !== Phaser.Math.Vector2.LEFT) {
            this.snakeDirection = Phaser.Math.Vector2.RIGHT;
        } else if ((cursors.up.isDown || this.wasdKeys.up.isDown) && dir !== Phaser.Math.Vector2.DOWN) {
            this.snakeDirection = Phaser.Math.Vector2.UP;
        } else if ((cursors.down.isDown || this.wasdKeys.down.isDown) && dir !== Phaser.Math.Vector2.UP) {
            this.snakeDirection = Phaser.Math.Vector2.DOWN;
        }
    });
}


        checkthisOver() {
            const head = this.snakeBody[0];
            const hitWall = head.x < 0 || head.x >= this.width || head.y < 0 || head.y >= this.height;
            const hitSelf = this.snakeBody.slice(1).some(seg => seg.x === head.x && seg.y === head.y);

            if (!this.isGameOver && (hitWall || hitSelf)) {
                this.isGameOver = true;
                this.gameOverEffect(head);
            }
        }

        gameOverEffect(target) {
            const emitter = this.add.particles(target.x, target.y, 'bubbles', {
                speed: { min: -100, max: 300 },
                scale: { start: .2, end: 0 },
                blendMode: 'MULTIPLY',
                lifespan: 750,
                tint: 0x93C54B
            });
            emitter.explode(75);

            const gameOverText = this.add.bitmapText(this.width / 2, this.height / 2 - 150, 'pixelfont', 'Game Over', 64)
                .setOrigin(0.5)
                .setVisible(false)
                .setAngle(-15).setTint(0xFF0000);

            this.vfx.shakeCamera();

            this.time.delayedCall(500, () => {
                this.sounds.lose.setVolume(1).setLoop(false).play();
                gameOverText.setVisible(true);
                this.tweens.add({
                    targets: gameOverText,
                    y: '+=200',
                    angle: 0,
                    scale: { from: 0.5, to: 2 },
                    alpha: { from: 0, to: 1 },
                    ease: 'Elastic.easeOut',
                    duration: 1500,
                    onComplete: () => {
                        this.time.delayedCall(1000, this.gameOver, [], this);
                    }
                });
            });
        }

        updateScore(points) {
            this.score += points;
            this.scoreText.setText(this.score);
        }

        gameOver() {
            initiateGameOver.bind(this)({ score: this.score });
        }

        pauseGame() {
            handlePauseGame.bind(this)();
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

    // Configuration object
    const config = {
        type: Phaser.AUTO,
        width: _CONFIG.deviceOrientationSizes[_CONFIG.deviceOrientation].width,
        height: _CONFIG.deviceOrientationSizes[_CONFIG.deviceOrientation].height,
        scene: [GameScene],
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        pixelArt: true,
        /* ADD CUSTOM CONFIG ELEMENTS HERE */
        physics: {
            default: "arcade",
            arcade: {
                gravity: { y: 400 },
                debug: false,
            },
        },
        dataObject: {
            name: _CONFIG.title,
            description: _CONFIG.description,
            instructions: _CONFIG.instructions,
        },
        orientation: _CONFIG.deviceOrientation === "landscape"
    };