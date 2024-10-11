const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

let playerId;
let players = {};
let zombies = []; // Array to store zombie entities
let bullets = []; // Array to store bullets
const zombieSpeed = 1; // Speed of the zombies
const zombieMinDistance = 50; // Minimum distance between zombies
const zombieSeparationDistance = 30; // Minimum distance for separation behavior
const zombieSize = 20; // Size of the zombies (width and height)
const maxZombieHealth = 3; // Health of each zombie
const bulletSize = 5; // Radius of the bullets
const bulletDamage = 1; // Damage done by each bullet

// Define map dimensions (with additional space for borders)
const borderThickness = 500; // Border thickness
const mapWidth = 2000; // Width of the playable area
const mapHeight = 2000; // Height of the playable area
const totalMapWidth = mapWidth + borderThickness * 2; // Total width including borders
const totalMapHeight = mapHeight + borderThickness * 2; // Total height including borders

// Track which keys are currently being pressed
const keysPressed = {};
const moveSpeed = 5;

// Camera position (initially centered around the player)
let cameraX = 0;
let cameraY = 0;

// Track mouse position
let mouseX = 0;
let mouseY = 0;

// Dynamically resize the canvas to fit the window
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

// Call resizeCanvas initially and whenever the window is resized
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Initial call to set up the canvas

// Start screen elements
const startScreen = document.getElementById('startScreen');
const playerNameInput = document.getElementById('playerName');
const startGameBtn = document.getElementById('startGameBtn');

// Listen for the "Start Game" button click
startGameBtn.addEventListener('click', () => {
    playerName = playerNameInput.value.trim();
    if (playerName) {
        startScreen.style.display = 'none';
        canvas.style.display = 'block';
        socket.emit('joinGame', { name: playerName });
    }
});

// Listen for initial game state
socket.on('init', (data) => {
    players = data.players;
    playerId = socket.id;
});

// Listen for new players
socket.on('newPlayer', (newPlayer) => {
    players[newPlayer.id] = newPlayer;
});

// Listen for player updates
socket.on('updatePlayers', (updatedPlayers) => {
    players = updatedPlayers;
});

// Listen for player disconnects
socket.on('playerDisconnected', (id) => {
    delete players[id];
});

// Track keydown and keyup events
document.addEventListener('keydown', (e) => {
    keysPressed[e.key] = true;
});

document.addEventListener('keyup', (e) => {
    delete keysPressed[e.key];
});

// Track mouse movement
canvas.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

// Function to check if a new zombie overlaps with existing ones
function isZombieOverlap(newZombie) {
    for (let zombie of zombies) {
        const dx = newZombie.x - zombie.x;
        const dy = newZombie.y - zombie.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < zombieMinDistance) {
            return true; // Overlapping
        }
    }
    return false; // No overlap
}

// Function to spawn zombies at random positions
function spawnZombie() {
    const x = Math.random() * totalMapWidth; // Random X position
    const y = Math.random() * totalMapHeight; // Random Y position

    const newZombie = { x, y, health: maxZombieHealth }; // Example zombie structure

    // Check for overlap and spawn only if it's valid
    if (!isZombieOverlap(newZombie)) {
        zombies.push(newZombie);
    } else {
        // If there is an overlap, recursively call to try again
        spawnZombie();
    }
}

// Call spawnZombie every few seconds
setInterval(spawnZombie, 3000); // Spawn a new zombie every 3 seconds

function movePlayer() {
    let dx = 0;
    let dy = 0;

    if (keysPressed['w']) dy = -moveSpeed;
    if (keysPressed['s']) dy = moveSpeed;
    if (keysPressed['a']) dx = -moveSpeed;
    if (keysPressed['d']) dx = moveSpeed;

    const player = players[playerId];

    if (player) {
        // Calculate new position
        const newX = player.x + dx;
        const newY = player.y + dy;

        // Ensure player stays within the map boundaries
        if (newX > player.radius + borderThickness && newX < totalMapWidth - player.radius - borderThickness) {
            player.x = newX;
        }
        if (newY > player.radius + borderThickness && newY < totalMapHeight - player.radius - borderThickness) {
            player.y = newY;
        }

        // Send the player's new position to the server
        socket.emit('move', { dx, dy });
    }
}

// Function to separate zombies if they get too close
function avoidOverlappingZombies(zombie) {
    zombies.forEach((otherZombie) => {
        if (otherZombie !== zombie) { // Ignore self
            const dx = zombie.x - otherZombie.x;
            const dy = zombie.y - otherZombie.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < zombieSeparationDistance) {
                const angle = Math.atan2(dy, dx);
                const avoidanceX = Math.cos(angle) * (zombieSeparationDistance - distance);
                const avoidanceY = Math.sin(angle) * (zombieSeparationDistance - distance);
                
                // Move the zombie away from the other one
                zombie.x += avoidanceX;
                zombie.y += avoidanceY;
            }
        }
    });
}

// Function to move zombies towards the player while avoiding each other
function moveZombies() {
    const player = players[playerId];
    if (player) {
        zombies.forEach((zombie) => {
            const dx = player.x - zombie.x;
            const dy = player.y - zombie.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Normalize the direction and move the zombie towards the player
            if (distance > 0) {
                zombie.x += (dx / distance) * zombieSpeed;
                zombie.y += (dy / distance) * zombieSpeed;
            }

            // Apply avoidance behavior
            avoidOverlappingZombies(zombie);
        });
    }
}

// Function to shoot a bullet toward the mouse cursor
function shootBullet() {
    const player = players[playerId];
    if (player) {
        // Calculate the direction to the mouse
        const mouseWorldX = mouseX + cameraX;
        const mouseWorldY = mouseY + cameraY;
        const dx = mouseWorldX - player.x;
        const dy = mouseWorldY - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Normalize the direction
        const directionX = dx / distance;
        const directionY = dy / distance;

        const bullet = {
            x: player.x,
            y: player.y,
            damage: bulletDamage, // Damage done by each bullet
            radius: bulletSize, // Radius of the bullet
            velocityX: directionX * 7, // Adjust speed of the bullet
            velocityY: directionY * 7, // Adjust speed of the bullet
            move: function() {
                this.x += this.velocityX;
                this.y += this.velocityY;
            }
        };

        bullets.push(bullet);
    }
}

// Function to check bullet collisions with zombies
function checkBulletCollisions() {
    bullets.forEach((bullet, bulletIndex) => {
        zombies.forEach((zombie, zombieIndex) => {
            const dx = bullet.x - zombie.x;
            const dy = bullet.y - zombie.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Check if the bullet hits the zombie
            if (distance < bullet.radius + zombieSize) {
                zombie.health -= bullet.damage; // Reduce zombie health
                // Check if zombie is dead
                if (zombie.health <= 0) {
                    // Remove the zombie from the array
                    zombies.splice(zombieIndex, 1);
                }
                // Remove the bullet after hitting the zombie
                bullets.splice(bulletIndex, 1);
            }
        });
    });
}

// Track shooting key event
document.addEventListener('mousedown', (e) => {
    shootBullet();
});

function drawMap() {
    // Draw the background map
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(-cameraX, -cameraY, totalMapWidth, totalMapHeight); // Draw total map area

    // Draw borders
    ctx.strokeStyle = 'black'; // Border color
    ctx.lineWidth = borderThickness; // Border thickness
    ctx.strokeRect(borderThickness / 2 - cameraX, borderThickness / 2 - cameraY, mapWidth + borderThickness, mapHeight + borderThickness);
}

// Capture mouse movements
canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left; // Adjust for canvas position
    mouseY = event.clientY - rect.top; // Adjust for canvas position
});

function drawPlayers() {
    Object.values(players).forEach((player) => {
        // Draw each player (circle)
        ctx.beginPath();
        ctx.arc(player.x - cameraX, player.y - cameraY, player.radius, 0, 2 * Math.PI);
        ctx.fillStyle = player.color;
        ctx.fill();
        ctx.strokeStyle = 'black'; // Outline color
        ctx.lineWidth = 2; // Outline width
        ctx.stroke(); // Draw outline

        // Calculate the angle from the player to the mouse
        const angle = Math.atan2(mouseY - (player.y - cameraY), mouseX - (player.x - cameraX));

        // Position the rectangle (gun) directly in front of the player
        const gunLength = 30; // Length of the gun
        const gunWidth = 10; // Width of the gun

        // Calculate the gun's position based on player's position and angle
        const gunX = player.x - cameraX + Math.cos(angle) * player.radius; // Position the gun in front
        const gunY = player.y - cameraY + Math.sin(angle) * player.radius; // Position the gun in front

        // Save the current context
        ctx.save();

        // Move the origin to the gun's position
        ctx.translate(gunX, gunY);
        
        // Rotate the context to the angle
        ctx.rotate(angle);

        // Draw the rectangle (gun)
        ctx.fillStyle = 'blue'; // Gun color
        ctx.fillRect(-gunLength / 2, -gunWidth / 2, gunLength, gunWidth); // Center the rectangle around the origin

        // Draw gun outline
        ctx.strokeStyle = 'black'; // Outline color for gun
        ctx.lineWidth = 2; // Outline width for gun
        ctx.strokeRect(-gunLength / 2, -gunWidth / 2, gunLength, gunWidth); // Center the rectangle around the origin

        // Restore the context to its original state
        ctx.restore();
    });
}


function drawZombies() {
    zombies.forEach((zombie) => {
        // Draw each zombie
        ctx.beginPath();
        ctx.arc(zombie.x - cameraX, zombie.y - cameraY, zombieSize, 0, 2 * Math.PI);
        ctx.fillStyle = 'green'; // Zombie color
        ctx.fill();
        ctx.strokeStyle = 'black'; // Outline color
        ctx.lineWidth = 2; // Outline width
        ctx.stroke(); // Draw outline
    });
}

function drawBullets() {
    bullets.forEach((bullet) => {
        // Draw each bullet
        ctx.beginPath();
        ctx.arc(bullet.x - cameraX, bullet.y - cameraY, bullet.radius, 0, 2 * Math.PI);
        ctx.fillStyle = 'red'; // Bullet color
        ctx.fill();
    });
}

function updateGame() {
    movePlayer();
    moveZombies();
    checkBulletCollisions();
    bullets.forEach((bullet) => bullet.move());

    // Center the camera on the player
    const player = players[playerId];
    if (player) {
        cameraX = player.x - canvas.width / 2;
        cameraY = player.y - canvas.height / 2;
    }

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw everything
    drawMap();
    drawPlayers();
    drawZombies();
    drawBullets();

    requestAnimationFrame(updateGame);
}

// Start the game loop
requestAnimationFrame(updateGame);