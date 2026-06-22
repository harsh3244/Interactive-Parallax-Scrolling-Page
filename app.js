/**
 * Aegis-9: Parallax Journey Controller
 * Manages momentum scroll calculations, Web Audio synthesis, Canvas particles, and HUD telemetry.
 */

// ==========================================================================
// STATE MANAGEMENT & CONFIG
// ==========================================================================
const state = {
  // Scroll details
  targetScrollY: 0,
  currentScrollY: 0,
  lastScrollY: 0,
  scrollEase: 0.08,
  maxScroll: 0,
  
  // Telemetry details
  altitude: -10000, // meters
  velocity: 0,      // m/s
  pressure: 1000,   // atm
  temperature: 2.0, // °C
  activeZoneIndex: 0,
  
  // Audio state
  audioInitialized: false,
  audioPlaying: false,
  audioContext: null,
  synthEngine: null,
  
  // Particle state
  particles: [],
  particleColor: 'rgba(0, 210, 255, 0.3)'
};

const ZONES = [
  { name: 'hadal_abyss', title: 'Hadal Abyss', startAlt: -10000, endAlt: -4000 },
  { name: 'sunlit_ocean', title: 'Sunlit Ocean', startAlt: -4000, endAlt: 0 },
  { name: 'canopy_land', title: 'Biosphere Shield', startAlt: 0, endAlt: 4000 },
  { name: 'stratosphere', title: 'Stratosphere', startAlt: 4000, endAlt: 80000 },
  { name: 'cosmos', title: 'Cosmic Void', startAlt: 80000, endAlt: 100000 }
];

const zoneThresholds = [0, 0.25, 0.5, 0.75, 1.0]; // Approximations for scroll percentage boundaries

// DOM Elements
const hudAltitude = document.getElementById('hud-altitude');
const hudVelocity = document.getElementById('hud-velocity');
const hudPressure = document.getElementById('hud-pressure');
const hudTemp = document.getElementById('hud-temp');
const hudProgress = document.getElementById('hud-progress');
const scrollPrompt = document.getElementById('scroll-prompt');
const logsContainer = document.getElementById('logs-container');
const audioToggle = document.getElementById('audio-toggle');
const navIndicator = document.getElementById('nav-indicator');
const navDots = document.querySelectorAll('.nav-dot');
const zonesElements = document.querySelectorAll('.zone');
const canvas = document.getElementById('telemetry-particles');
const ctx = canvas.getContext('2d');

// ==========================================================================
// INITIALIZATION
// ==========================================================================
function init() {
  setupCanvas();
  setupEventListeners();
  calculateMaxScroll();
  
  // Set initial layers speeds
  document.querySelectorAll('.parallax-layer').forEach(layer => {
    const speed = layer.getAttribute('data-speed');
    layer.style.setProperty('--speed', speed);
  });
  
  // Add first system log
  addLogEntry('> System initialized. Awaiting vertical trajectory initiation.');
  
  // Start the main update loop
  requestAnimationFrame(tick);
}

function setupCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function calculateMaxScroll() {
  state.maxScroll = document.documentElement.scrollHeight - window.innerHeight;
}

function setupEventListeners() {
  window.addEventListener('resize', () => {
    setupCanvas();
    calculateMaxScroll();
  });

  // Track target scroll
  window.addEventListener('scroll', () => {
    state.targetScrollY = window.scrollY;
    
    // Hide scroll prompt on initial scroll
    if (window.scrollY > 100) {
      scrollPrompt.style.opacity = '0';
    } else {
      scrollPrompt.style.opacity = '1';
    }
  });

  // Navigation click links
  navDots.forEach((dot, index) => {
    dot.addEventListener('click', () => {
      const targetZone = zonesElements[index];
      if (targetZone) {
        window.scrollTo({
          top: targetZone.offsetTop,
          behavior: 'smooth'
        });
        addLogEntry(`> Targeting coordinates: Zone ${index + 1} (${ZONES[index].title})`);
      }
    });
  });

  // Audio button
  audioToggle.addEventListener('click', toggleAudio);
}

// ==========================================================================
// MISSION LOGS
// ==========================================================================
function addLogEntry(text, type = 'system') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerText = text;
  logsContainer.appendChild(entry);
  
  // Auto-scroll logs
  logsContainer.scrollTop = logsContainer.scrollHeight;
  
  // Cap logs count
  while (logsContainer.children.length > 25) {
    logsContainer.removeChild(logsContainer.firstChild);
  }
}

// ==========================================================================
// SMOOTH SCROLL & PARALLAX CALCULATIONS
// ==========================================================================
function tick(timestamp) {
  // 1. Smooth Scroll Interpolation (Lerp)
  state.currentScrollY += (state.targetScrollY - state.currentScrollY) * state.scrollEase;
  
  // Prevent infinite micro-values
  if (Math.abs(state.targetScrollY - state.currentScrollY) < 0.05) {
    state.currentScrollY = state.targetScrollY;
  }

  // 2. Parallax Layers Update
  zonesElements.forEach(zone => {
    // Check if zone is near/in viewport
    const rect = zone.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      // Calculate offset relative to viewport center vs zone center
      const zoneCenter = zone.offsetTop + zone.offsetHeight / 2;
      const viewportCenter = state.currentScrollY + window.innerHeight / 2;
      const zoneOffset = viewportCenter - zoneCenter;
      zone.style.setProperty('--scroll-offset', `${zoneOffset}px`);
    }
  });

  // 3. Update HUD Data
  updateTelemetry();
  
  // 4. Update Particle Canvas
  updateParticles();
  
  // 5. Update Web Audio Synthesizer variables
  updateAudioSynthesis();

  // Save scroll for next velocity frame
  state.lastScrollY = state.currentScrollY;

  requestAnimationFrame(tick);
}

// ==========================================================================
// TELEMETRY UPDATES
// ==========================================================================
function updateTelemetry() {
  const maxScroll = state.maxScroll || 1;
  const scrollFraction = Math.max(0, Math.min(1, state.currentScrollY / maxScroll));
  
  // Update overall progress bar
  hudProgress.style.width = `${scrollFraction * 100}%`;
  
  // 1. Calculate Altitude (-10k to +100k)
  const baseAltitude = -10000 + (scrollFraction * 110000);
  state.altitude = Math.round(baseAltitude);
  
  // Format altitude with leading sign and commas
  const sign = state.altitude >= 0 ? '+' : '';
  hudAltitude.innerText = `${sign}${state.altitude.toLocaleString()} m`;
  
  // 2. Calculate Velocity (Speed of Scroll)
  const scrollDelta = Math.abs(state.currentScrollY - state.lastScrollY);
  // Scale scroll speed to realistic ascent speed (m/s)
  const targetVelocity = scrollDelta * 2.8;
  state.velocity += (targetVelocity - state.velocity) * 0.1;
  hudVelocity.innerText = `${state.velocity.toFixed(1)} m/s`;
  
  // 3. Dynamic Environmental Data Based on Altitude
  calculateEnvironment(baseAltitude);
  
  // 4. Navigation Panel Indicators
  updateNavIndicators();
}

function calculateEnvironment(alt) {
  // Pressure & Temperature maps based on Altitude
  if (alt < -4000) {
    // Hadal Abyss: pressure high, temp constant cold
    const pct = (alt - (-10000)) / 6000; // 0 to 1
    state.pressure = Math.round(1000 - (pct * 600)); // 1000 to 400 atm
    state.temperature = 2.0;
    setZone(0);
  } else if (alt < 0) {
    // Ocean: pressure drops to 1, temp rises to surface
    const pct = (alt - (-4000)) / 4000; // 0 to 1
    state.pressure = Math.round(400 - (pct * 399)); // 400 to 1 atm
    state.temperature = parseFloat((2.0 + (pct * 16.0)).toFixed(1)); // 2.0 to 18.0 °C
    setZone(1);
  } else if (alt < 4000) {
    // Canopy/Land: pressure drops to 0.6, temp drops with elevation
    const pct = alt / 4000;
    state.pressure = parseFloat((1.0 - (pct * 0.4)).toFixed(2)); // 1.0 to 0.6 atm
    state.temperature = parseFloat((18.0 - (pct * 28.0)).toFixed(1)); // 18.0 to -10.0 °C
    setZone(2);
  } else if (alt < 80000) {
    // Stratosphere: pressure drops to near-vacuum, temp fluctuates
    const pct = (alt - 4000) / 76000;
    state.pressure = parseFloat((0.6 * Math.exp(-pct * 7)).toFixed(4)); // Exponential drop
    // Stratosphere rises from -10 to -60 then climbs to -15, then back down
    if (pct < 0.5) {
      state.temperature = parseFloat((-10.0 - (pct * 2 * 50.0)).toFixed(1)); // down to -60
    } else {
      state.temperature = parseFloat((-60.0 + ((pct - 0.5) * 2 * 45.0)).toFixed(1)); // up to -15
    }
    setZone(3);
  } else {
    // Cosmos: vacuum, absolute near-zero temperature
    const pct = Math.min(1, (alt - 80000) / 20000);
    state.pressure = 0.0;
    state.temperature = parseFloat((-15.0 - (pct * 255.0)).toFixed(1)); // down to -270 °C
    setZone(4);
  }
  
  hudPressure.innerText = state.pressure === 0 ? '0.00 atm' : `${state.pressure.toLocaleString()} atm`;
  hudTemp.innerText = `${state.temperature.toFixed(1)} °C`;
}

function setZone(index) {
  if (state.activeZoneIndex !== index) {
    state.activeZoneIndex = index;
    
    // Update active nav dot
    navDots.forEach((dot, idx) => {
      if (idx === index) dot.classList.add('active');
      else dot.classList.remove('active');
    });
    
    // Broadcast zone change logs
    const logMessages = [
      '> Alert: Deep sea Hadal descent complete. Thermal vents active.',
      '> Surface photic boundary reached. Solar cell recharge initialized.',
      '> Breached sea level boundary. Atmospheric sensors calibrated.',
      '> Stratospheric border crossed. Ozone buffer active. Thermal shielding engaged.',
      '> Outer space Karman boundary. Gravity vectors null. Star telemetry locked.'
    ];
    
    const isWarp = Math.abs(state.targetScrollY - state.currentScrollY) > 500;
    const prefix = isWarp ? '[WARP] ' : '';
    addLogEntry(prefix + logMessages[index], index === 0 || index === 4 ? 'warn' : 'system');
    
    // Change particle characteristics
    triggerZoneParticleTransition(index);
  }
}

function updateNavIndicators() {
  const track = document.querySelector('.nav-track');
  const trackHeight = track.clientHeight;
  const maxScroll = state.maxScroll || 1;
  const pct = Math.max(0, Math.min(1, state.currentScrollY / maxScroll));
  
  // Map indicator position to align perfectly with the centers of the nav buttons
  const minTop = 10;
  const maxTop = trackHeight - 10;
  const indicatorTop = minTop + pct * (maxTop - minTop);
  
  // Update indicator circle top position
  navIndicator.style.top = `${indicatorTop}px`;
}

// ==========================================================================
// PROCEDURAL SOUND SYNTHESIZER (WEB AUDIO API)
// ==========================================================================
function toggleAudio() {
  if (!state.audioInitialized) {
    initAudioContext();
  }
  
  if (state.audioPlaying) {
    state.synthEngine.stop();
    audioToggle.classList.add('muted');
    state.audioPlaying = false;
    addLogEntry('> Audio Transmission feed: OFFLINE');
  } else {
    state.synthEngine.start();
    audioToggle.classList.remove('muted');
    state.audioPlaying = true;
    addLogEntry('> Audio Transmission feed: ONLINE');
  }
}

function initAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  state.audioContext = new AudioContext();
  
  // Custom Synthesizer Engine
  state.synthEngine = {
    oscillators: [],
    noiseNode: null,
    lowpassFilter: null,
    gains: {},
    masterGain: null,
    
    setup: function() {
      const ctx = state.audioContext;
      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.0, ctx.currentTime);
      this.masterGain.connect(ctx.destination);
      
      // 1. Ocean Deep Drone (Low frequency sine/saw oscillators)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const oceanGain = ctx.createGain();
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(55, ctx.currentTime); // A1 note
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(55.5, ctx.currentTime); // Detuned for chorus
      
      oceanGain.gain.setValueAtTime(0.0, ctx.currentTime);
      
      osc1.connect(oceanGain);
      osc2.connect(oceanGain);
      oceanGain.connect(this.masterGain);
      
      osc1.start();
      osc2.start();
      
      this.oscillators.push(osc1, osc2);
      this.gains.ocean = oceanGain;
      
      // 2. Atmosphere Wind (White Noise filtered)
      const bufferSize = 2 * ctx.sampleRate;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      
      this.noiseNode = ctx.createBufferSource();
      this.noiseNode.buffer = noiseBuffer;
      this.noiseNode.loop = true;
      
      this.lowpassFilter = ctx.createBiquadFilter();
      this.lowpassFilter.type = 'bandpass';
      this.lowpassFilter.Q.setValueAtTime(3.0, ctx.currentTime);
      this.lowpassFilter.frequency.setValueAtTime(400, ctx.currentTime);
      
      const windGain = ctx.createGain();
      windGain.gain.setValueAtTime(0.0, ctx.currentTime);
      
      this.noiseNode.connect(this.lowpassFilter);
      this.lowpassFilter.connect(windGain);
      windGain.connect(this.masterGain);
      
      this.noiseNode.start();
      
      this.gains.wind = windGain;
      
      // 3. Space Pulse / Cosmic Drone (High triangle oscillator modulated)
      const spaceOsc = ctx.createOscillator();
      const spaceGain = ctx.createGain();
      
      spaceOsc.type = 'triangle';
      spaceOsc.frequency.setValueAtTime(110, ctx.currentTime); // A2 note
      
      spaceGain.gain.setValueAtTime(0.0, ctx.currentTime);
      spaceOsc.connect(spaceGain);
      spaceGain.connect(this.masterGain);
      spaceOsc.start();
      
      this.oscillators.push(spaceOsc);
      this.gains.space = spaceGain;
    },
    
    start: function() {
      if (state.audioContext.state === 'suspended') {
        state.audioContext.resume();
      }
      this.masterGain.gain.linearRampToValueAtTime(0.4, state.audioContext.currentTime + 1.0);
    },
    
    stop: function() {
      this.masterGain.gain.linearRampToValueAtTime(0.0, state.audioContext.currentTime + 0.5);
    }
  };
  
  state.synthEngine.setup();
  state.audioInitialized = true;
}

function updateAudioSynthesis() {
  if (!state.audioPlaying || !state.synthEngine) return;
  
  const ctx = state.audioContext;
  const now = ctx.currentTime;
  const maxScroll = state.maxScroll || 1;
  const pct = state.currentScrollY / maxScroll;
  
  // Crossfade channels based on scroll percentage
  // Ocean: peak at pct = 0 (Abyss) fading to pct = 0.45 (Canopy)
  const oceanVol = Math.max(0, 1 - (pct / 0.45));
  state.synthEngine.gains.ocean.gain.setTargetAtTime(oceanVol * 0.7, now, 0.2);
  
  // Wind: peaks in atmosphere (Canopy to Stratosphere) around pct = 0.5 to 0.75
  let windVol = 0;
  if (pct > 0.2 && pct < 0.85) {
    if (pct < 0.55) {
      windVol = (pct - 0.2) / 0.35; // fade in
    } else {
      windVol = 1 - ((pct - 0.55) / 0.3); // fade out
    }
  }
  state.synthEngine.gains.wind.gain.setTargetAtTime(windVol * 0.4, now, 0.2);
  
  // Modulate wind filter frequency slightly based on velocity to simulate gusts!
  const filterFreq = 300 + (windVol * 200) + (state.velocity * 5);
  state.synthEngine.lowpassFilter.frequency.setTargetAtTime(filterFreq, now, 0.1);
  
  // Space: starts peaking above stratosphere (pct > 0.7) and maxes at cosmos (pct = 1.0)
  let spaceVol = 0;
  if (pct > 0.65) {
    spaceVol = (pct - 0.65) / 0.35;
  }
  state.synthEngine.gains.space.gain.setTargetAtTime(spaceVol * 0.6, now, 0.2);
}

// ==========================================================================
// DYNAMIC PARTICLE SYSTEM
// ==========================================================================
class Particle {
  constructor(type) {
    this.type = type;
    this.reset();
  }
  
  reset() {
    this.x = Math.random() * canvas.width;
    
    if (this.type === 'bubble') {
      // Spawn at bottom, drift up
      this.y = canvas.height + Math.random() * 50;
      this.size = Math.random() * 4 + 1;
      this.vx = Math.random() * 0.6 - 0.3;
      this.vy = -(Math.random() * 1.5 + 0.5);
      this.color = `rgba(0, 210, 255, ${Math.random() * 0.3 + 0.15})`;
    } 
    else if (this.type === 'leaf') {
      // Spawn at top, fall diagonally
      this.y = -20 - Math.random() * 50;
      this.size = Math.random() * 6 + 4;
      this.vx = Math.random() * 1.5 + 0.5; // Drift right
      this.vy = Math.random() * 1.0 + 1.0;  // Fall
      this.color = `rgba(${120 + Math.random() * 80}, ${180 + Math.random() * 40}, 80, ${Math.random() * 0.4 + 0.2})`;
      this.rotation = Math.random() * Math.PI;
      this.rotationSpeed = Math.random() * 0.02 - 0.01;
    } 
    else if (this.type === 'cloud') {
      // Spawn on left or right, big wispy layers
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 80 + 40;
      this.vx = Math.random() * 0.4 + 0.2;
      this.vy = Math.random() * 0.1 - 0.05;
      this.color = `rgba(255, 255, 255, ${Math.random() * 0.06 + 0.02})`;
    }
    else {
      // Star particle
      this.y = Math.random() * canvas.height;
      this.size = Math.random() * 2 + 0.5;
      this.vx = (Math.random() * 0.1 - 0.05);
      this.vy = (Math.random() * 0.1 - 0.05);
      this.color = `rgba(255, 255, 255, ${Math.random() * 0.8 + 0.2})`;
      this.twinkleSpeed = Math.random() * 0.03 + 0.01;
      this.twinkleFactor = Math.random();
    }
  }
  
  update() {
    this.x += this.vx;
    this.y += this.vy;
    
    // Add velocity/wind influence based on scroll movement
    const scrollWind = (state.currentScrollY - state.lastScrollY) * 0.5;
    if (this.type === 'bubble') {
      this.y -= scrollWind * 0.2; // Bubbles rise faster on upward travel
    } else if (this.type === 'leaf') {
      this.y += scrollWind * 0.3; // Leaves fall faster
      this.rotation += this.rotationSpeed;
    } else if (this.type === 'cloud') {
      this.y += scrollWind * 0.4;
    } else {
      // Stars warp/streak on high velocity scroll
      this.y += scrollWind * 0.1;
    }
    
    // Check bounds
    if (this.y < -100 || this.y > canvas.height + 100 || this.x < -100 || this.x > canvas.width + 100) {
      this.reset();
    }
  }
  
  draw() {
    ctx.beginPath();
    if (this.type === 'bubble') {
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    } 
    else if (this.type === 'leaf') {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.fillStyle = this.color;
      // Draw a leaf shape
      ctx.ellipse(0, 0, this.size, this.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } 
    else if (this.type === 'cloud') {
      // Wispy circles
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
    else {
      // Star with twinkle
      this.twinkleFactor += this.twinkleSpeed;
      const alpha = 0.2 + Math.abs(Math.sin(this.twinkleFactor)) * 0.8;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function triggerZoneParticleTransition(zoneIndex) {
  // Clear half the particles to let the new type occupy space
  const currentCount = state.particles.length;
  state.particles = state.particles.slice(0, Math.floor(currentCount / 2));
  
  // Decide target type
  const targetTypes = ['bubble', 'bubble', 'leaf', 'cloud', 'star'];
  const targetType = targetTypes[zoneIndex];
  
  // Populate to target amount
  const count = getParticleCountForZone(zoneIndex);
  for (let i = state.particles.length; i < count; i++) {
    state.particles.push(new Particle(targetType));
  }
}

function getParticleCountForZone(zoneIndex) {
  switch (zoneIndex) {
    case 0: return 80;  // bubbles in abyss
    case 1: return 60;  // bubbles in sunlit ocean
    case 2: return 40;  // leaves in forest
    case 3: return 20;  // clouds in stratosphere
    case 4: return 120; // stars in space
    default: return 50;
  }
}

function updateParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Initialize particles if empty
  if (state.particles.length === 0) {
    const count = getParticleCountForZone(state.activeZoneIndex);
    const types = ['bubble', 'bubble', 'leaf', 'cloud', 'star'];
    const type = types[state.activeZoneIndex];
    for (let i = 0; i < count; i++) {
      const p = new Particle(type);
      // Randomize initial Y positions so they don't spawn in a line
      p.y = Math.random() * canvas.height;
      state.particles.push(p);
    }
  }
  
  // Update and draw
  state.particles.forEach(p => {
    p.update();
    p.draw();
  });
}

// Start
window.onload = init;
