// ============================================================================
// RETRO RALLY 3D - ENGINE DEFINITIVO CON 3 PISTAS SINCRO REALES
// ============================================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

const WIDTH = 800;
const HEIGHT = 450;
canvas.width = WIDTH;
canvas.height = HEIGHT;

const FPS = 60;
const STEP = 1 / FPS;
const ROAD_WIDTH = 2000;       
const SEGMENT_LENGTH = 65;     
const DRAW_DISTANCE = 200;     
const BASE_CAMERA_DEPTH = 0.85;
const CAMERA_HEIGHT_DEFAULT = 1000; 

// Imágenes de los autos
const carTextures = [];
const carImageNames = ["escarabajo.png", "coupe.png", "hypercar.png"];
carImageNames.forEach((name, index) => {
    carTextures[index] = new Image();
    carTextures[index].src = name; 
});

const VEHICLE_PRESETS = [
    { name: "VW Escarabajo", maxSpeed: 198, accel: 182, brake: -330, decel: -80, handling: 3.2 },
    { name: "Coupé GT", maxSpeed: 231, accel: 215, brake: -372, decel: -88, handling: 3.5 },
    { name: "V12 Hypercar", maxSpeed: 273, accel: 256, brake: -454, decel: -100, handling: 3.9 }
];

// Mismo +10% aplicado a los rivales para no romper el balance de la carrera
const DIFFICULTY_PRESETS = [
    { name: "Fácil", minSpeed: 108, maxSpeedDelta: 33, curveSlowdown: 0.15 },
    { name: "Media", minSpeed: 136, maxSpeedDelta: 45, curveSlowdown: 0.05 },
    { name: "Difícil", minSpeed: 174, maxSpeedDelta: 42, curveSlowdown: 0.01 }
];

let selectedDifficultyIdx = 1; 
let selectedVehicleIdx = 0;
let selectedTrackIdx = 0;
let MAX_SPEED = 198;         
let ACCEL = 182;             
let BRAKE = -330;            
let DECEL = -88;             
const OFF_ROAD_ACCEL_FACTOR = 0.4; 
// Controla qué tan rápido el giro llega a su máximo (STEER_RAMP_RATE) y qué tan rápido se apaga al soltar (STEER_DECAY).
// Valores más bajos de RAMP y más altos de DECAY (más cerca de 1) = giro más suave/progresivo.
const STEER_RAMP_RATE = 4.5;
const STEER_DECAY = 0.88;
// Antes era 24: controla cuántas unidades de mundo se recorren por punto de "velocidad" por segundo.
// Bajarlo hace que el circuito se sienta más lento y legible sin tocar los números de velocidad en pantalla.
const WORLD_SCROLL_FACTOR = 20;

let gameState = 'START';
let totalTime = 0;
let timeLeft = 90;
let currentLap = 1;
let TOTAL_LAPS = 3;
let score = 0;
let damage = 0;
let crashCooldown = 0;

let playerX = 0;               
let position = 0;              
let speed = 0;
let playerRpm = 1000;
let steerInput = 0;

let camX = 0;
let camY = CAMERA_HEIGHT_DEFAULT;
let skyScrollX = 0;

let trackSegments = [];
let trackLength = 0;

let countdownTime = 3.5; 
let countdownText = "3";
let opponents = [];
const TOTAL_OPPONENTS = 4;

const MOUNTAIN_PEAKS_LAYER1 = [50, 35, 60, 40, 55, 30, 45, 60, 35, 50, 40, 55, 30, 60];
const MOUNTAIN_PEAKS_LAYER2 = [75, 50, 90, 60, 85, 45, 70, 95, 55, 80, 65, 90, 50, 85];

let particles = [];
const keys = { left: false, right: false, up: false, down: false };

function initInputSystem() {
    const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '];

    window.addEventListener('keydown', (e) => {
        if (NAV_KEYS.includes(e.key)) e.preventDefault(); // evita que la página haga scroll con las flechas
        if (e.key === 'ArrowLeft'  || e.key.toLowerCase() === 'a') keys.left = true;
        if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keys.right = true;
        if (e.key === 'ArrowUp'    || e.key.toLowerCase() === 'w') keys.up = true;
        if (e.key === 'ArrowDown'  || e.key.toLowerCase() === 's') keys.down = true;
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowLeft'  || e.key.toLowerCase() === 'a') keys.left = false;
        if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keys.right = false;
        if (e.key === 'ArrowUp'    || e.key.toLowerCase() === 'w') keys.up = false;
        if (e.key === 'ArrowDown'  || e.key.toLowerCase() === 's') keys.down = false;
    });

    window.pressTouchKey = function(key) { if (keys.hasOwnProperty(key)) keys[key] = true; };
    window.releaseTouchKey = function(key) { if (keys.hasOwnProperty(key)) keys[key] = false; };

    const btnStart = document.getElementById('btnStartRace');
    if (btnStart) {
        btnStart.onclick = function () {
            const trackSelect = document.getElementById('selectTrack');
            const vehicleSelect = document.getElementById('selectVehicle');
            const difficultySelect = document.getElementById('selectDifficulty');
            
            selectedTrackIdx = trackSelect ? parseInt(trackSelect.value) : 0;
            selectedVehicleIdx = vehicleSelect ? parseInt(vehicleSelect.value) : 0;
            selectedDifficultyIdx = difficultySelect ? parseInt(difficultySelect.value) : 1;

            let vp = VEHICLE_PRESETS[selectedVehicleIdx];
            MAX_SPEED = vp.maxSpeed;
            ACCEL = vp.accel;
            BRAKE = vp.brake;
            DECEL = vp.decel;

            buildSelectedChampionshipTrack(selectedTrackIdx);
            invalidateMinimapCache();
            spawnOpponentsIA();
            startCountdownSequence();
        };
    }
}

// ============================================================================
// CONFIGURACIÓN ASIGNADA DE SEGMENTOS RECOPIADOS PARA LAS 3 PISTAS DEL MENÚ
// ============================================================================
function buildSelectedChampionshipTrack(type) {
    trackSegments = [];
    TOTAL_LAPS = 3;

    if (type === 0) {
        // Circuito del Lazo Completo (Geometría del Video)
        timeLeft = 110;
        addRoadSegment(90, 0.0, 0);   
        addRoadSegment(60, 1.8, 1);
        addRoadSegment(120, 3.4, 2);  
        addRoadSegment(60, 1.8, -1);
        addRoadSegment(100, -0.6, -2);
        addRoadSegment(70, -2.0, 3);
        addRoadSegment(130, -3.8, 1); 
        addRoadSegment(70, -2.0, -2);
        addRoadSegment(80, 1.2, -3);
        addRoadSegment(50, 0.0, 0);
    } else if (type === 1) {
        // Suzuka GP (Curvas en 'S', horquillas y rectas rápidas)
        timeLeft = 120;
        addRoadSegment(80, 0.0, 0);    // Recta principal
        addRoadSegment(40, 2.5, 1);    // Primera curva a la derecha
        addRoadSegment(50, -2.0, 2);   // Curvas S izquierda
        addRoadSegment(50, 2.0, -1);   // S derecha
        addRoadSegment(60, -1.5, 0);   // Curva Dunlop
        addRoadSegment(80, 0.0, -2);   // Recta trasera
        addRoadSegment(40, -4.5, 3);   // Horquilla cerrada (Hairpin)
        addRoadSegment(70, 3.0, -1);   // Curva de la Cuchara
        addRoadSegment(90, 0.0, 0);    // Recta del túnel
        addRoadSegment(40, -2.0, 0);   // Chicane final
    } else {
        // Mónaco Street Circuit (Urbano, trabado y exigente)
        timeLeft = 140;
        addRoadSegment(50, 0.0, 0);    // Recta de Largada
        addRoadSegment(35, 4.0, 4);    // Subida Sainte-Dévote
        addRoadSegment(50, 1.5, 2);    // Tramo Beau Rivage
        addRoadSegment(40, -3.5, -2);  // Curva de Massenet
        addRoadSegment(30, 5.0, -4);   // Casino Square bajando
        addRoadSegment(45, -7.0, -2);  // Horquilla súper cerrada de Loews (Grand Hotel)
        addRoadSegment(60, 2.0, 0);    // Entrada al Túnel
        addRoadSegment(40, -3.0, 1);   // Chicane del Puerto
        addRoadSegment(40, 4.0, 0);    // Curva de la Piscina
        addRoadSegment(40, -5.0, -1);  // La Rascasse
    }

    trackLength = trackSegments.length * SEGMENT_LENGTH;
    
    let currentX = 0;
    let currentY = 0;
    for (let i = 0; i < trackSegments.length; i++) {
        let seg = trackSegments[i];
        seg.p1.world.x = currentX;
        seg.p1.world.y = currentY;
        currentX += seg.curve * 3.8; 
        currentY += seg.hill * 2.2;
        seg.p2.world.x = currentX;
        seg.p2.world.y = currentY;
    }
}

// Suaviza la sharpness de todas las curvas de las 3 pistas en un solo punto (afecta física y minimapa por igual,
// ya que ambos leen seg.curve una vez que addRoadSegment ya lo guardó escalado).
const CURVE_SOFTEN_FACTOR = 0.6;

function addRoadSegment(num, curve, hill) {
    curve *= CURVE_SOFTEN_FACTOR;
    for (let i = 0; i < num; i++) {
        let isAlternate = Math.floor(trackSegments.length / 4) % 2;
        trackSegments.push({
            index: trackSegments.length,
            p1: { world: { x: 0, y: 0, z: trackSegments.length * SEGMENT_LENGTH }, screen: { x: 0, y: 0, w: 0 } },
            p2: { world: { x: 0, y: 0, z: (trackSegments.length + 1) * SEGMENT_LENGTH }, screen: { x: 0, y: 0, w: 0 } },
            curve: curve,
            hill: hill,
            color: isAlternate ? { grass: '#1a5220', road: '#38383a', rumble: '#ffffff' } 
                               : { grass: '#113d16', road: '#303032', rumble: '#d60000' }
        });
    }
}

// Evita estirar/deformar las imágenes de los autos (cada PNG tiene su propio aspect ratio:
// coupe 500x500, escarabajo 433x577, hypercar 360x360). Ajusta dentro de la caja manteniendo proporción.
function computeFitDims(img, boxW, boxH) {
    if (!img || !img.naturalWidth || !img.naturalHeight) return { w: boxW, h: boxH };
    const boxAspect = boxW / boxH;
    const imgAspect = img.naturalWidth / img.naturalHeight;
    if (imgAspect > boxAspect) {
        return { w: boxW, h: boxW / imgAspect };
    }
    return { w: boxH * imgAspect, h: boxH };
}

function findSegment(z) {
    if (trackSegments.length === 0) return null;
    let index = Math.floor(z / SEGMENT_LENGTH) % trackSegments.length;
    if (index < 0) index += trackSegments.length;
    return trackSegments[index];
}

function spawnOpponentsIA() {
    opponents = [];
    let diff = DIFFICULTY_PRESETS[selectedDifficultyIdx];
    for (let i = 0; i < TOTAL_OPPONENTS; i++) {
        opponents.push({
            id: i,
            position: 700 + (i * 800), 
            lapsCompleted: 0, 
            playerX: (i % 2 === 0) ? -0.45 : 0.45,
            speed: diff.minSpeed + (Math.random() * diff.maxSpeedDelta),
            textureIndex: Math.floor(Math.random() * 3)
        });
    }
}

function startCountdownSequence() {
    gameState = 'COUNTDOWN';
    countdownTime = 3.5;
    countdownText = "3";
    document.getElementById('menuStart').classList.add('hidden');
    document.getElementById('menuGameOver').classList.add('hidden');
}

function updatePhysicsEngine(dt) {
    if (trackSegments.length === 0) return;

    if (gameState === 'COUNTDOWN') {
        countdownTime -= dt;
        if (countdownTime > 2.5) countdownText = "3";
        else if (countdownTime > 1.5) countdownText = "2";
        else if (countdownTime > 0.5) countdownText = "1";
        else if (countdownTime > -0.5) countdownText = "¡GO!";
        else gameState = 'RUNNING';
        
        updateOpponentsIA(dt);
        return;
    }

    if (gameState !== 'RUNNING') return;

    totalTime += dt;
    timeLeft -= dt;

    if (timeLeft <= 0) {
        timeLeft = 0; gameState = 'GAME_OVER';
        showEndScreen("TIEMPO LÍMITE SUPERADO\nInténtalo de nuevo.", false);
        return;
    }

    updateOpponentsIA(dt);

    let currentSegment = findSegment(position);
    if (!currentSegment) return;
    
    let isOffRoad = Math.abs(playerX) > 1.0;

    if (keys.up) {
        let maxLimit = isOffRoad ? MAX_SPEED * 0.5 : MAX_SPEED;
        let accelRate = isOffRoad ? ACCEL * OFF_ROAD_ACCEL_FACTOR : ACCEL;
        if (speed < maxLimit) speed += (accelRate * dt * 1.5);
        else speed += (DECEL * dt);
    } else if (keys.down) {
        speed += (BRAKE * dt);
    } else {
        speed += (DECEL * dt * 2.0);
    }

    speed = Math.max(0, Math.min(speed, MAX_SPEED));
    playerRpm = playerRpm * 0.8 + (1000 + (speed / MAX_SPEED) * 6500) * 0.2;

    if (speed > 0) {
        let steerSpeed = VEHICLE_PRESETS[selectedVehicleIdx].handling * (isOffRoad ? 0.6 : 1.0) * (speed / MAX_SPEED);
        // steerInput ahora maneja también el desplazamiento real (antes solo inclinaba el sprite),
        // por eso el auto acelera y frena su giro lateral de forma gradual en vez de saltar de golpe.
        if (keys.left) {
            steerInput = Math.max(-1, steerInput - dt * STEER_RAMP_RATE);
        } else if (keys.right) {
            steerInput = Math.min(1, steerInput + dt * STEER_RAMP_RATE);
        } else {
            steerInput *= STEER_DECAY;
        }
        playerX += (steerInput * steerSpeed * dt * 1.6);
    }

    if (speed > 0) {
        playerX -= (dt * (speed / MAX_SPEED) * currentSegment.curve * 0.5);
        skyScrollX -= (currentSegment.curve * (speed / MAX_SPEED) * 0.0025);
    }

    if (Math.abs(playerX) > 1.8) {
        playerX = Math.sign(playerX) * 1.8;
        crashCooldown -= dt;
        if (crashCooldown <= 0) {
            speed = Math.max(speed * 0.5, 25);
            damage = Math.min(100, damage + 8);
            crashCooldown = 0.5; // medio segundo entre golpes, evita perder 100% de daño en <1s
            if (damage >= 100) {
                gameState = 'GAME_OVER';
                showEndScreen("VEHÍCULO AVERIADO\nDaño crítico en el motor.", false);
                return;
            }
        }
    }

    position += (speed * WORLD_SCROLL_FACTOR * dt);
    
    if (position >= trackLength) {
        if (currentLap < TOTAL_LAPS) {
            position = position % trackLength; 
            currentLap++; 
            timeLeft += 30; 
            score += 3000;
        } else {
            let finalRank = calculateRealRacePosition(true); 
            gameState = 'GAME_OVER'; speed = 0;
            showEndScreen(`¡CARRERA COMPLETADA!\nClasificación: P${finalRank}\nScore Final: ${score + Math.floor(timeLeft * 100)}`, finalRank <= 2);
            return;
        }
    }

    if (speed > 10) {
        score += Math.floor((speed / 90));
        if (isOffRoad && Math.random() < 0.25) {
            particles.push({ x: playerX * (WIDTH * 0.25) + (Math.random() * 20 - 10), y: HEIGHT - 40, size: Math.random() * 3 + 2, alpha: 0.6, color: '#9e7a44' });
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].y -= 2; particles[i].alpha -= 0.05;
        if (particles[i].alpha <= 0) particles.splice(i, 1);
    }
}

function updateOpponentsIA(dt) {
    let diff = DIFFICULTY_PRESETS[selectedDifficultyIdx];
    for (let cp of opponents) {
        let seg = findSegment(cp.position);
        if (!seg) continue;
        cp.position += (cp.speed * (1.0 - (Math.abs(seg.curve) * diff.curveSlowdown)) * WORLD_SCROLL_FACTOR * dt);
        if (cp.position >= trackLength) { 
            cp.position = cp.position % trackLength; 
            cp.lapsCompleted++; 
        }
        cp.playerX += Math.sin(totalTime * 2.5 + cp.id) * 0.012;
    }
}

let _cachedRank = 1;
let _rankFrameCount = 0;
const RANK_UPDATE_INTERVAL = 30; // recalcular posición cada 30 frames (~0.5s) en vez de cada frame

function calculateRealRacePosition(raceFinished = false) {
    let playerDist = raceFinished ? (TOTAL_LAPS * trackLength) : ((currentLap - 1) * trackLength + position);
    let rank = 1;
    for (let cp of opponents) {
        let cpDist = cp.lapsCompleted * trackLength + cp.position;
        if (cpDist > playerDist) rank++;
    }
    return rank;
}

function project3D(point, cameraX, cameraY, cameraZ, depth) {
    let transX = point.world.x - cameraX;
    let transY = point.world.y - cameraY;
    let transZ = point.world.z - cameraZ;
    if (transZ < 0) transZ += trackLength;
    let scale = depth / transZ;
    point.screen.x = Math.round((WIDTH / 2) + (scale * transX * WIDTH / 2));
    point.screen.y = Math.round((HEIGHT / 2) - (scale * transY * HEIGHT / 2));
    point.screen.w = Math.round(scale * ROAD_WIDTH * WIDTH / 2);
    return scale;
}

function drawChampionshipHorizon(horizonY) {
    ctx.fillStyle = '#1c1026'; ctx.beginPath(); ctx.moveTo(0, HEIGHT); ctx.lineTo(0, horizonY);
    for (let i = 0; i <= WIDTH; i += 40) {
        let idx = Math.abs(Math.floor(i / 40 + skyScrollX * 10)) % MOUNTAIN_PEAKS_LAYER1.length;
        ctx.lineTo(i, horizonY - MOUNTAIN_PEAKS_LAYER1[idx]);
    }
    ctx.lineTo(WIDTH, HEIGHT); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#2d163d'; ctx.beginPath(); ctx.moveTo(0, HEIGHT); ctx.lineTo(0, horizonY);
    for (let i = 0; i <= WIDTH; i += 50) {
        let idx = Math.abs(Math.floor(i / 50 + skyScrollX * 18)) % MOUNTAIN_PEAKS_LAYER2.length;
        ctx.lineTo(i, horizonY - MOUNTAIN_PEAKS_LAYER2[idx]);
    }
    ctx.lineTo(WIDTH, HEIGHT); ctx.closePath(); ctx.fill();
}

function showEndScreen(text, isVictory) {
    const titleElement = document.getElementById('goTitle');
    titleElement.innerText = isVictory ? "¡VICTORIA!" : "FIN DE JUEGO";
    titleElement.style.color = isVictory ? "#00ffcc" : "#ff0055"; 
    document.getElementById('goReason').innerText = text;
    document.getElementById('menuGameOver').classList.remove('hidden');
}

// Gradiente de cielo: inmutable, se crea una sola vez al iniciar
const _skyGrad = ctx.createLinearGradient(0, 0, 0, HEIGHT / 2);
_skyGrad.addColorStop(0, '#04020a'); _skyGrad.addColorStop(0.6, '#8a1f00'); _skyGrad.addColorStop(1, '#e57c00');
// (2 objetos anidados x 200 segmentos x 60fps = ~24.000 objetos/seg antes de este cambio).
const _renderPt1 = { world: { x: 0, y: 0, z: 0 }, screen: { x: 0, y: 0, w: 0 } };
const _renderPt2 = { world: { x: 0, y: 0, z: 0 }, screen: { x: 0, y: 0, w: 0 } };

function executeGraphicsRender() {
    if (trackSegments.length === 0) return;
    ctx.imageSmoothingEnabled = false;

    let shakeX = 0, shakeY = 0;
    if (gameState === 'RUNNING' && speed > 20) {
        let shk = (speed / MAX_SPEED) * (Math.abs(playerX) > 1.0 ? 2.5 : 0.5);
        shakeX = (Math.random() - 0.5) * shk; shakeY = (Math.random() - 0.5) * shk;
    }

    ctx.fillStyle = _skyGrad; ctx.fillRect(0, 0, WIDTH, HEIGHT);

    let horizonY = Math.round(HEIGHT / 2);
    drawChampionshipHorizon(horizonY);

    let playerSegment = findSegment(position);
    let playerPercent = (position % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    camY = camY * 0.8 + ((playerSegment.p1.world.y + (playerSegment.p2.world.y - playerSegment.p1.world.y) * playerPercent) + CAMERA_HEIGHT_DEFAULT) * 0.2;
    // camX ya no suma playerSegment.p1/p2.world.x: ese término era el mismo valor absoluto que
    // acabamos de sacar del render por causar el desfasaje. En coordenadas locales, el segmento
    // de la cámara siempre es la referencia "0", así que solo queda el offset lateral por dirección.
    camX = camX * 0.8 + (playerX * ROAD_WIDTH) * 0.2;

    let maxy = HEIGHT;
    let startIdx = Math.floor(position / SEGMENT_LENGTH);
    let spritesToRender = [];
    let dx = -(playerSegment.curve * playerPercent), xAccum = 0;

    for (let i = 0; i < DRAW_DISTANCE; i++) {
        let currentIdx = (startIdx + i) % trackSegments.length;
        let seg = trackSegments[currentIdx];
        let camZOffset = position - (startIdx + i >= trackSegments.length ? trackLength : 0);

        let pt1 = _renderPt1, pt2 = _renderPt2;
        // Antes: "seg.p1.world.x + xAccum" sumaba un valor absoluto (acumulado sin cerrar el lazo
        // desde el segmento 0 hasta el último) con uno local (reiniciado en 0 cada frame). Al cruzar
        // del último segmento al primero (justo en la línea de llegada) los dos no coincidían y
        // generaban un salto visible en el ancho/posición de la pista. Usando solo la acumulación
        // local, el resultado es continuo sin importar en qué punto de la vuelta esté la cámara.
        pt1.world.x = xAccum; pt1.world.y = seg.p1.world.y; pt1.world.z = seg.p1.world.z;
        pt2.world.x = xAccum + dx + seg.curve; pt2.world.y = seg.p2.world.y; pt2.world.z = seg.p2.world.z;

        let scale = project3D(pt1, camX + shakeX * 3, camY + shakeY * 3, camZOffset, BASE_CAMERA_DEPTH);
        project3D(pt2, camX + shakeX * 3, camY + shakeY * 3, camZOffset, BASE_CAMERA_DEPTH);

        xAccum += dx; dx += seg.curve;
        if (pt1.screen.y >= maxy || pt2.screen.y >= maxy || scale <= 0) continue;

        ctx.fillStyle = seg.color.grass; ctx.fillRect(0, pt2.screen.y, WIDTH, (pt1.screen.y + 1) - pt2.screen.y);
        
        let r1 = pt1.screen.w * 0.12, r2 = pt2.screen.w * 0.12;
        ctx.fillStyle = seg.color.rumble;
        ctx.beginPath(); ctx.moveTo(pt1.screen.x - pt1.screen.w - r1, pt1.screen.y + 1); ctx.lineTo(pt1.screen.x - pt1.screen.w, pt1.screen.y + 1); ctx.lineTo(pt2.screen.x - pt2.screen.w, pt2.screen.y); ctx.lineTo(pt2.screen.x - pt2.screen.w - r2, pt2.screen.y); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(pt1.screen.x + pt1.screen.w + r1, pt1.screen.y + 1); ctx.lineTo(pt1.screen.x + pt1.screen.w, pt1.screen.y + 1); ctx.lineTo(pt2.screen.x + pt2.screen.w, pt2.screen.y); ctx.lineTo(pt2.screen.x + pt2.screen.w + r2, pt2.screen.y); ctx.closePath(); ctx.fill();
        
        ctx.fillStyle = seg.color.road;
        ctx.beginPath(); ctx.moveTo(pt1.screen.x - pt1.screen.w, pt1.screen.y + 1); ctx.lineTo(pt1.screen.x + pt1.screen.w, pt1.screen.y + 1); ctx.lineTo(pt2.screen.x + pt2.screen.w, pt2.screen.y); ctx.lineTo(pt2.screen.x - pt2.screen.w, pt2.screen.y); ctx.closePath(); ctx.fill();
        
        if (seg.index === 0) { 
            ctx.fillStyle = '#ffffff'; ctx.fillRect(pt1.screen.x - pt1.screen.w, pt2.screen.y, pt1.screen.w * 2, (pt1.screen.y - pt2.screen.y) * 0.4);
        }

        maxy = pt1.screen.y;

        for (let cp of opponents) {
            if ((Math.floor(cp.position / SEGMENT_LENGTH) % trackSegments.length) === seg.index) {
                spritesToRender.push({ sx: pt1.screen.x + shakeX, sy: pt1.screen.y + shakeY, cp: cp, scale: scale });
            }
        }
    }

    for (let p of particles) {
        ctx.fillStyle = p.color; ctx.globalAlpha = p.alpha; ctx.beginPath();
        ctx.arc(WIDTH / 2 + p.x + shakeX, p.y + shakeY, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    for (let i = spritesToRender.length - 1; i >= 0; i--) {
        let s = spritesToRender[i];
        let spriteX = Math.round(s.sx + (s.scale * s.cp.playerX * ROAD_WIDTH * WIDTH / 2));
        let sizeMultiplier = 3.75; // 75% del tamaño duplicado anterior (5)
        let w = Math.round(190 * s.scale * (WIDTH / 2) * sizeMultiplier);
        let h = Math.round(130 * s.scale * (WIDTH / 2) * sizeMultiplier);
        
        if (spriteX + w/2 > 0 && spriteX - w/2 < WIDTH) {
            let rivalImg = carTextures[s.cp.textureIndex];
            if (rivalImg && rivalImg.complete && rivalImg.naturalWidth !== 0) {
                const dims = computeFitDims(rivalImg, w, h);
                ctx.drawImage(rivalImg, spriteX - dims.w / 2, s.sy - dims.h, dims.w, dims.h);
            } else {
                ctx.fillStyle = (s.cp.textureIndex === 0) ? '#ff2a00' : (s.cp.textureIndex === 1) ? '#0066ff' : '#ccaa00';
                ctx.fillRect(spriteX - w / 2, s.sy - h + (25 * sizeMultiplier), w, h - (40 * sizeMultiplier));
            }
        }
    }

    if (gameState === 'RUNNING' || gameState === 'COUNTDOWN') {
        const cW = 285, cH = 195; // 75% del tamaño duplicado anterior (380x260)
        const cX = (WIDTH / 2) - (cW / 2) + (steerInput * 35) + shakeX;
        const cY = HEIGHT - cH - 20 + shakeY;
        let currentImg = carTextures[selectedVehicleIdx];

        if (currentImg && currentImg.complete && currentImg.naturalWidth !== 0) {
            const dims = computeFitDims(currentImg, cW, cH);
            const dx = cX + (cW - dims.w) / 2;
            const dy = cY + (cH - dims.h);
            ctx.drawImage(currentImg, dx, dy, dims.w, dims.h);
        } else {
            let colBody = (selectedVehicleIdx === 0) ? '#ff2a00' : (selectedVehicleIdx === 1) ? '#0066ff' : '#ccaa00';
            ctx.fillStyle = '#0f0f14'; ctx.fillRect(cX + 6, cY + cH - 35, 24, 35); ctx.fillRect(cX + cW - 30, cY + cH - 35, 24, 35); 
            ctx.fillStyle = colBody; ctx.fillRect(cX, cY + 25, cW, cH - 40); 
            ctx.fillStyle = '#14161f'; ctx.fillRect(cX + 16, cY + 35, cW - 32, 25); 
            ctx.fillStyle = keys.down ? '#ff1111' : '#660000'; ctx.fillRect(cX + 8, cY + cH - 28, 22, 10); ctx.fillRect(cX + cW - 30, cY + cH - 28, 22, 10); 
        }
    }

    drawHUD();
    
    const trackSelect = document.getElementById('selectTrack');
    let activeTrack = trackSelect ? parseInt(trackSelect.value) : selectedTrackIdx;
    drawAbsoluteMathematicalMinimap(ctx, WIDTH - 115, 20, 95, true, activeTrack); 
}

// Cache del minimapa: el trazado geométrico es fijo por pista, no tiene sentido recalcularlo 60 veces/seg.
// Se invalida solo cuando cambia selectedTrackIdx (al presionar Empezar o al volver al menú).
let _minimapCache = null; // { trackType, coords, minX, maxX, minY, maxY }

function _buildMinimapCoords(segmentsToDraw) {
    let coords = [];
    let heading = 0, cx = 0, cz = 0;
    let totalCurve = 0;
    for (const s of segmentsToDraw) totalCurve += s.curve;

    // La corrección anterior usaba (-2π / N) e ignoraba la curvatura acumulada real de la pista,
    // así que el heading total no cerraba en ±360° y el minimapa se deformaba.
    // Fórmula correcta: corrPerSeg = (targetHeading - totalCurve×0.015) / N
    // donde targetHeading = -2π si la pista gira en sentido horario (sumaCurva < 0), +2π si antihorario.
    const targetHeading = totalCurve <= 0 ? -2 * Math.PI : 2 * Math.PI;
    const corrPerSeg = (targetHeading - totalCurve * 0.015) / segmentsToDraw.length;

    for (let i = 0; i < segmentsToDraw.length; i++) {
        heading += (segmentsToDraw[i].curve * 0.015) + corrPerSeg;
        cx += Math.cos(heading) * SEGMENT_LENGTH * 0.1;
        cz += Math.sin(heading) * SEGMENT_LENGTH * 0.1;
        coords.push({ x: cx, y: cz });
    }

    // Reparto lineal del gap posicional residual (mínimo con la corrección de heading exacta)
    const lastIdx = coords.length - 1;
    const gapX = coords[lastIdx].x, gapY = coords[lastIdx].y;
    for (let i = 0; i < coords.length; i++) {
        const t = i / lastIdx;
        coords[i].x -= gapX * t;
        coords[i].y -= gapY * t;
    }

    // Bounding box precalculado (evita 4 spreads de array en cada frame)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of coords) {
        if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x;
        if (c.y < minY) minY = c.y; if (c.y > maxY) maxY = c.y;
    }
    return { coords, minX, maxX, minY, maxY };
}

function invalidateMinimapCache() { _minimapCache = null; }
// ============================================================================
// DIBUJO GEOMÉTRICO 100% SINCRO DINÁMICO BASADO EN SEGMENTOS REALES (CORREGIDO)
// ============================================================================
function drawAbsoluteMathematicalMinimap(targetCtx, x, y, size, renderActors, trackType) {
    targetCtx.fillStyle = 'rgba(12, 6, 22, 0.9)';
    targetCtx.strokeStyle = '#5c2e91';
    targetCtx.lineWidth = 3;
    targetCtx.beginPath();
    targetCtx.roundRect(x, y, size, size, 8);
    targetCtx.fill();
    targetCtx.stroke();

    let segmentsToDraw = trackSegments;
    if (!renderActors || trackSegments.length === 0) {
        let backupSegments = trackSegments;
        let backupLength = trackLength;
        let backupTimeLeft = timeLeft;
        let backupTotalLaps = TOTAL_LAPS;
        buildSelectedChampionshipTrack(trackType);
        segmentsToDraw = trackSegments;
        trackSegments = backupSegments;
        trackLength = backupLength;
        timeLeft = backupTimeLeft;
        TOTAL_LAPS = backupTotalLaps;
    }

    if (segmentsToDraw.length === 0) return;

    // Usar cache del trazado; recalcular solo si cambió la pista
    if (!_minimapCache || _minimapCache.trackType !== trackType) {
        _minimapCache = { trackType, ..._buildMinimapCoords(segmentsToDraw) };
    }
    const { coords, minX, maxX, minY, maxY } = _minimapCache;

    const trackW = maxX - minX;
    const trackH = maxY - minY;
    const scale = Math.min((size - 24) / (trackW || 1), (size - 24) / (trackH || 1));
    const offsetX = x + (size - trackW * scale) / 2 - minX * scale;
    const offsetY = y + (size - trackH * scale) / 2 - minY * scale;

    targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    targetCtx.lineWidth = 4;
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    targetCtx.beginPath();
    for (let i = 0; i < coords.length; i++) {
        const scX = offsetX + coords[i].x * scale;
        const scY = offsetY + coords[i].y * scale;
        if (i === 0) targetCtx.moveTo(scX, scY);
        else targetCtx.lineTo(scX, scY);
    }
    targetCtx.closePath();
    targetCtx.stroke();

    if (!renderActors || trackSegments.length === 0) return;

    // Enemigos en el mapa
    targetCtx.fillStyle = '#ff3355';
    for (let cp of opponents) {
        let idx = Math.floor((cp.position / trackLength) * coords.length) % coords.length;
        if (coords[idx]) {
            targetCtx.beginPath();
            targetCtx.arc(offsetX + coords[idx].x * scale, offsetY + coords[idx].y * scale, 3.5, 0, Math.PI * 2);
            targetCtx.fill();
        }
    }

    // Jugador en el mapa
    let pIdx = Math.floor((position / trackLength) * coords.length) % coords.length;
    if (coords[pIdx]) {
        targetCtx.fillStyle = '#00ffcc';
        targetCtx.strokeStyle = '#ffffff';
        targetCtx.lineWidth = 1.5;
        targetCtx.beginPath();
        targetCtx.arc(offsetX + coords[pIdx].x * scale, offsetY + coords[pIdx].y * scale, 5.5, 0, Math.PI * 2);
        targetCtx.fill();
        targetCtx.stroke();
    }
}

window.updateMenuTrackPreview = function() {
    const pCanvas = document.getElementById('menuMapCanvas');
    const trackSelect = document.getElementById('selectTrack');
    if (pCanvas && trackSelect) {
        let trackType = parseInt(trackSelect.value);
        const pCtx = pCanvas.getContext('2d');
        pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
        drawAbsoluteMathematicalMinimap(pCtx, 5, 5, 120, false, trackType);
    }
};

function drawHUD() {
    if (gameState === 'START') return;
    if (gameState === 'COUNTDOWN') {
        ctx.fillStyle = '#ffcc00'; ctx.font = 'bold 55px monospace'; ctx.textAlign = 'center';
        ctx.fillText(countdownText, WIDTH / 2, HEIGHT / 2 - 30); ctx.textAlign = 'left';
        return;
    }

    ctx.fillStyle = timeLeft < 15 ? '#ff3333' : '#ffffff'; ctx.font = 'bold 24px monospace';
    ctx.fillText(`TIEMPO: ${Math.ceil(timeLeft)}s`, 25, 45);

    ctx.fillStyle = '#ffffff'; ctx.font = '22px monospace';
    ctx.fillText(`${Math.floor(speed)} KM/H`, 25, 75);

    ctx.fillStyle = '#222533'; ctx.fillRect(25, 88, 140, 6);
    ctx.fillStyle = playerRpm > 6000 ? '#ff3333' : '#00ffcc';
    ctx.fillRect(25, 88, (playerRpm / 7500) * 140, 6);

    ctx.fillStyle = '#8a9ab0'; ctx.font = '15px monospace';
    ctx.fillText(`DAÑO: ${damage}%`, 25, 120);

    ctx.fillStyle = '#ffff00'; ctx.font = 'bold 22px monospace';
    ctx.fillText(`PUNTOS: ${score}`, WIDTH - 390, 45);
    
    let kmRecorridos = ((currentLap - 1) * trackLength + position) / 1000;
    let kmTotales = (TOTAL_LAPS * trackLength) / 1000;
    ctx.fillStyle = '#ffffff'; ctx.font = '16px monospace';
    ctx.fillText(`TRK: ${kmRecorridos.toFixed(2)} / ${kmTotales.toFixed(2)} KM`, WIDTH - 390, 75);

    _rankFrameCount++;
    if (_rankFrameCount >= RANK_UPDATE_INTERVAL) {
        _cachedRank = calculateRealRacePosition(gameState === 'GAME_OVER');
        _rankFrameCount = 0;
    }
    let rank = _cachedRank;
    ctx.fillStyle = '#00ffcc'; ctx.font = 'bold 18px monospace';
    ctx.fillText(`POSICIÓN: P${rank} (VUELTA ${currentLap}/${TOTAL_LAPS})`, WIDTH - 390, 105);
}

function runMasterGameLoop() {
    updatePhysicsEngine(STEP);
    executeGraphicsRender();
    requestAnimationFrame(runMasterGameLoop);
}

function resetRaceState() {
    position = 0; speed = 0; totalTime = 0; currentLap = 1; score = 0; damage = 0; playerX = 0; crashCooldown = 0;
    particles = []; steerInput = 0; camX = 0; camY = CAMERA_HEIGHT_DEFAULT; skyScrollX = 0;
    _cachedRank = 1; _rankFrameCount = 0;
    invalidateMinimapCache();
    gameState = 'START';
    document.getElementById('menuGameOver').classList.add('hidden');
    document.getElementById('menuStart').classList.remove('hidden');
    setTimeout(window.updateMenuTrackPreview, 50);
}

window.resetRaceState = resetRaceState;
window.onload = function() {
    initInputSystem();
    buildSelectedChampionshipTrack(0); 
    setTimeout(window.updateMenuTrackPreview, 100); 
    runMasterGameLoop();
};