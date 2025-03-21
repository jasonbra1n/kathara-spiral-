const canvas = document.getElementById('spiralCanvas');
const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
if (!gl) throw new Error('WebGL not supported');

let currentParams = {};
let history = [];
const defaultParams = {
  scale: 30, nodes: 12, rotation: 0, layers: 3, layerRatio: 2,
  verticalMirror: false, horizontalMirror: false, strokeColor: '#00FFFF',
  lineWidth: 2, opacity: 1, spiralType: 'linear', backgroundColor: '#111111',
  verticalColor: '#FF00FF', horizontalColor: '#FFFF00', bothColor: '#FFFFFF',
  gradientStroke: true, dashEffect: false, curvedLines: false,
  lineEndStyle: 'boxed', // New parameter: 'boxed', 'tapered', or 'rounded'
  scaleGap: 10, scaleSensitivity: 1
};
let baseScale = defaultParams.scale;

// -------------------------------
// WebGL Setup
// -------------------------------
const vertexShaderSource = `
  attribute vec2 a_position;
  attribute float a_distance;
  attribute float a_width;
  attribute vec2 a_normal;
  uniform vec2 u_resolution;
  varying float v_distance;
  varying float v_width;
  varying vec2 v_normal;
  void main() {
    vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);
    v_distance = a_distance;
    v_width = a_width;
    v_normal = a_normal;
  }
`;

const fragmentShaderSource = `
  precision mediump float;
  uniform vec4 u_color;
  uniform float u_dashSize;
  uniform float u_gapSize;
  uniform int u_dashEnabled;
  uniform int u_gradientEnabled;
  uniform int u_lineEndStyle; // 0: boxed, 1: tapered, 2: rounded
  uniform float u_maxDistance;
  uniform float u_lineWidth;
  varying float v_distance;
  varying float v_width;
  varying vec2 v_normal;
  void main() {
    vec4 color = u_color;
    if (u_gradientEnabled == 1) {
      float t = v_distance / u_maxDistance;
      color.rgb = mix(color.rgb, vec3(0.0), t);
    }
    if (u_lineEndStyle == 1) { // Tapered
      float t = v_distance / u_maxDistance;
      float taperFactor = 1.0 - t;
      if (length(v_normal) > taperFactor * u_lineWidth / 2.0) discard;
    }
    if (u_lineEndStyle == 2) { // Rounded
      float distFromCenter = length(v_normal);
      if (distFromCenter > u_lineWidth / 2.0) discard;
    }
    if (u_dashEnabled == 1 && mod(v_distance, u_dashSize + u_gapSize) > u_dashSize) discard;
    gl_FragColor = color;
  }
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  console.error(gl.getProgramInfoLog(program));
}
gl.useProgram(program);

const positionBuffer = gl.createBuffer();
const distanceBuffer = gl.createBuffer();
const widthBuffer = gl.createBuffer();
const normalBuffer = gl.createBuffer();
const positionLocation = gl.getAttribLocation(program, 'a_position');
const distanceLocation = gl.getAttribLocation(program, 'a_distance');
const widthLocation = gl.getAttribLocation(program, 'a_width');
const normalLocation = gl.getAttribLocation(program, 'a_normal');
const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
const colorLocation = gl.getUniformLocation(program, 'u_color');
const dashSizeLocation = gl.getUniformLocation(program, 'u_dashSize');
const gapSizeLocation = gl.getUniformLocation(program, 'u_gapSize');
const dashEnabledLocation = gl.getUniformLocation(program, 'u_dashEnabled');
const gradientEnabledLocation = gl.getUniformLocation(program, 'u_gradientEnabled');
const lineEndStyleLocation = gl.getUniformLocation(program, 'u_lineEndStyle');
const maxDistanceLocation = gl.getUniformLocation(program, 'u_maxDistance');
const lineWidthLocation = gl.getUniformLocation(program, 'u_lineWidth');

gl.enableVertexAttribArray(positionLocation);
gl.enableVertexAttribArray(distanceLocation);
gl.enableVertexAttribArray(widthLocation);
gl.enableVertexAttribArray(normalLocation);

// -------------------------------
// Canvas Setup
// -------------------------------
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
  drawSpiral();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// -------------------------------
// Populate Preset Selector
// -------------------------------
function populatePresetSelector() {
  const presetSelector = document.getElementById('presetSelector');
  presetOptions.forEach(option => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    presetSelector.appendChild(opt);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  populatePresetSelector();
});

// -------------------------------
// Spiral Drawing Functions
// -------------------------------
function drawSpiralOnContext(gl, width, height, params) {
  const bg = params.backgroundColor;
  gl.clearColor(
    parseInt(bg.slice(1, 3), 16) / 255,
    parseInt(bg.slice(3, 5), 16) / 255,
    parseInt(bg.slice(5, 7), 16) / 255,
    1.0
  );
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.uniform2f(resolutionLocation, width, height);

  const centerX = width / 2;
  const centerY = height / 2;

  for (let l = 0; l < params.layers; l++) {
    const currentScale = params.scale * Math.pow(params.layerRatio / 5, l);
    const initialAngle = (params.rotation + (l * 10)) * (Math.PI / 180);

    drawSpiralPath(gl, centerX, centerY, params, initialAngle, currentScale, false, false, params.strokeColor);
    if (params.verticalMirror || params.horizontalMirror) {
      if (params.verticalMirror && params.horizontalMirror) {
        drawSpiralPath(gl, centerX, centerY, params, initialAngle, currentScale, true, true, params.bothColor);
      }
      if (params.verticalMirror) {
        drawSpiralPath(gl, centerX, centerY, params, initialAngle, currentScale, true, false, params.verticalColor);
      }
      if (params.horizontalMirror) {
        drawSpiralPath(gl, centerX, centerY, params, initialAngle, currentScale, false, true, params.horizontalColor);
      }
    }
  }
}

function generateThickLineVertices(startX, startY, endX, endY, width, isFirst, isLast, lineEndStyle) {
  const dx = endX - startX;
  const dy = endY - startY;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = dy / len * width / 2;
  const ny = -dx / len * width / 2;

  let vertices = [];
  let normals = [];

  if (lineEndStyle === 'tapered' && isLast) {
    // Tapered end: width reduces to 0 at the end
    vertices = [
      startX + nx, startY + ny,
      startX - nx, startY - ny,
      endX, endY,
      endX, endY
    ];
    normals = [
      nx, ny,
      -nx, -ny,
      0, 0,
      0, 0
    ];
  } else {
    // Boxed or rounded: consistent width
    vertices = [
      startX + nx, startY + ny,
      startX - nx, startY - ny,
      endX + nx, endY + ny,
      endX - nx, endY - ny
    ];
    normals = [
      nx, ny,
      -nx, -ny,
      nx, ny,
      -nx, -ny
    ];
  }

  return { vertices, normals };
}

function quadraticBezier(t, p0, p1, p2) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const x = uu * p0[0] + 2 * u * t * p1[0] + tt * p2[0];
  const y = uu * p0[1] + 2 * u * t * p1[1] + tt * p2[1];
  return [x, y];
}

function drawSpiralPath(gl, centerX, centerY, params, initialAngle, currentScale, mirrorX, mirrorY, color) {
  const positions = [];
  const distances = [];
  const widths = [];
  const normals = [];
  let angle = initialAngle;
  let prevX = centerX;
  let prevY = centerY;
  let totalDistance = 0;
  const baseWidth = params.lineWidth;

  // Generate vertices for each segment
  for (let i = 1; i < params.nodes; i++) {
    let r = params.spiralType === 'linear' ? currentScale * i : currentScale * Math.exp(0.1 * i);
    let x = centerX + Math.cos(angle) * r;
    let y = centerY + Math.sin(angle) * r;

    if (mirrorX) x = centerX * 2 - x;
    if (mirrorY) y = centerY * 2 - y;

    const segmentLength = Math.sqrt((x - prevX) ** 2 + (y - prevY) ** 2);
    const d_start = totalDistance;
    const d_end = totalDistance + segmentLength;

    if (params.lineWidth > 1) {
      const isLastSegment = i === params.nodes - 1;
      const { vertices, normals: segmentNormals } = generateThickLineVertices(
        prevX, prevY, x, y, baseWidth, i === 1, isLastSegment, params.lineEndStyle
      );

      // Vertices: v0 (start top), v1 (start bottom), v2 (end top), v3 (end bottom)
      const v0 = [vertices[0], vertices[1]];
      const v1 = [vertices[2], vertices[3]];
      const v2 = [vertices[4], vertices[5]];
      const v3 = [vertices[6], vertices[7]];
      const n0 = [segmentNormals[0], segmentNormals[1]];
      const n1 = [segmentNormals[2], segmentNormals[3]];
      const n2 = [segmentNormals[4], segmentNormals[5]];
      const n3 = [segmentNormals[6], segmentNormals[7]];

      // Triangle 1: v0, v1, v2
      positions.push(v0[0], v0[1], v1[0], v1[1], v2[0], v2[1]);
      distances.push(d_start, d_start, d_end);
      widths.push(baseWidth, baseWidth, baseWidth);
      normals.push(n0[0], n0[1], n1[0], n1[1], n2[0], n2[1]);

      // Triangle 2: v2, v1, v3
      positions.push(v2[0], v2[1], v1[0], v1[1], v3[0], v3[1]);
      distances.push(d_end, d_start, d_end);
      widths.push(baseWidth, baseWidth, baseWidth);
      normals.push(n2[0], n2[1], n1[0], n1[1], n3[0], n3[1]);
    } else {
      positions.push(x, y);
      distances.push(d_end);
      widths.push(baseWidth);
      normals.push(0, 0);
    }

    totalDistance += segmentLength;
    prevX = x;
    prevY = y;
    angle += Math.PI / 3; // Adjust angle increment based on shape (e.g., heptagon: 2π/7)
  }

  // Set up buffers
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, distanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(distances), gl.STATIC_DRAW);
  gl.vertexAttribPointer(distanceLocation, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, widthBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(widths), gl.STATIC_DRAW);
  gl.vertexAttribPointer(widthLocation, 1, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
  gl.vertexAttribPointer(normalLocation, 2, gl.FLOAT, false, 0, 0);

  // Set uniforms
  const r = parseInt(color.slice(1, 3), 16) / 255;
  const g = parseInt(color.slice(3, 5), 16) / 255;
  const b = parseInt(color.slice(5, 7), 16) / 255;
  gl.uniform4f(colorLocation, r, g, b, params.opacity);
  gl.uniform1f(dashSizeLocation, 5.0);
  gl.uniform1f(gapSizeLocation, 5.0);
  gl.uniform1i(dashEnabledLocation, params.dashEffect ? 1 : 0);
  gl.uniform1i(gradientEnabledLocation, params.gradientStroke ? 1 : 0);
  gl.uniform1i(lineEndStyleLocation, params.lineEndStyle === 'boxed' ? 0 : params.lineEndStyle === 'tapered' ? 1 : 2);
  gl.uniform1f(maxDistanceLocation, totalDistance);
  gl.uniform1f(lineWidthLocation, baseWidth);

  // Draw
  if (params.lineWidth > 1) {
    const vertexCount = (params.nodes - 1) * 6; // 6 vertices per segment (2 triangles)
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
  } else {
    gl.drawArrays(gl.LINE_STRIP, 0, params.nodes);
  }
}

function updateParams() {
  currentParams = {
    scale: parseFloat(document.getElementById('scale').value),
    nodes: parseInt(document.getElementById('nodes').value),
    rotation: parseFloat(document.getElementById('rotation').value),
    layers: parseInt(document.getElementById('layers').value),
    layerRatio: parseFloat(document.getElementById('layerRatio').value),
    verticalMirror: document.getElementById('verticalMirror').checked,
    horizontalMirror: document.getElementById('horizontalMirror').checked,
    strokeColor: document.getElementById('strokeColor').value,
    lineWidth: parseFloat(document.getElementById('lineWidth').value),
    opacity: parseFloat(document.getElementById('opacity').value),
    spiralType: document.getElementById('spiralType').value,
    backgroundColor: document.getElementById('backgroundColor').value,
    verticalColor: document.getElementById('verticalColor').value,
    horizontalColor: document.getElementById('horizontalColor').value,
    bothColor: document.getElementById('bothColor').value,
    gradientStroke: document.getElementById('gradientStroke').checked,
    dashEffect: document.getElementById('dashEffect').checked,
    curvedLines: document.getElementById('curvedLines').checked,
    lineEndStyle: document.getElementById('lineEndStyle').value,
    autoRotate: document.getElementById('autoRotate').checked,
    audioReactive: document.getElementById('audioReactive').checked,
    audioRotate: document.getElementById('audioRotate').checked,
    audioScale: document.getElementById('audioScale').checked,
    audioOpacity: document.getElementById('audioOpacity').checked,
    scaleGap: parseFloat(document.getElementById('scaleGap')?.value || defaultParams.scaleGap),
    scaleSensitivity: parseFloat(document.getElementById('scaleSensitivity')?.value || defaultParams.scaleSensitivity)
  };
}

function drawSpiral() {
  updateParams();
  drawSpiralOnContext(gl, canvas.width, canvas.height, currentParams);
}

// -------------------------------
// Presets, Undo, Reset
// -------------------------------
document.getElementById('presetSelector').addEventListener('change', function() {
  const preset = presets[this.value];
  if (preset) {
    Object.keys(preset).forEach(key => {
      const element = document.getElementById(key);
      if (element.type === 'checkbox') element.checked = preset[key];
      else element.value = preset[key];
      const valueSpan = document.getElementById(key + 'Value');
      if (valueSpan) valueSpan.textContent = preset[key];
      if (key === 'layerRatio') {
        const numberInput = document.getElementById('layerRatioNumber');
        if (numberInput) numberInput.value = parseFloat(preset[key]).toFixed(1);
      }
      if (key === 'scale') {
        baseScale = parseFloat(preset[key]);
        document.getElementById('scale').value = baseScale;
        document.getElementById('scaleValue').textContent = baseScale.toFixed(1);
      }
    });
    saveState();
    drawSpiral();
  }
});

function saveState() {
  const state = {};
  document.querySelectorAll('input, select').forEach(el => {
    state[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  history.push(state);
  if (history.length > 10) history.shift();
}

function undo() {
  if (history.length > 1) {
    history.pop();
    const lastState = history[history.length - 1];
    Object.keys(lastState).forEach(key => {
      const el = document.getElementById(key);
      if (el.type === 'checkbox') el.checked = lastState[key];
      else el.value = lastState[key];
      const valueSpan = document.getElementById(key + 'Value');
      if (valueSpan) valueSpan.textContent = lastState[key];
      if (key === 'scale') baseScale = parseFloat(lastState[key]);
    });
    drawSpiral();
  }
}

function reset() {
  Object.keys(defaultParams).forEach(key => {
    const el = document.getElementById(key);
    if (el) {
      if (el.type === 'checkbox') el.checked = defaultParams[key];
      else el.value = defaultParams[key];
      const valueSpan = document.getElementById(key + 'Value');
      if (valueSpan) valueSpan.textContent = defaultParams[key];
      if (key === 'scale') baseScale = defaultParams[key];
    }
  });
  document.getElementById('autoRotate').checked = false;
  document.getElementById('audioReactive').checked = false;
  document.getElementById('audioRotate').checked = false;
  document.getElementById('audioScale').checked = false;
  document.getElementById('audioOpacity').checked = false;
  document.getElementById('scaleGap').value = defaultParams.scaleGap;
  document.getElementById('scaleGapValue').textContent = defaultParams.scaleGap;
  document.getElementById('scaleSensitivity').value = defaultParams.scaleSensitivity;
  document.getElementById('scaleSensitivityValue').textContent = defaultParams.scaleSensitivity;
  history = [];
  drawSpiral();
}

// -------------------------------
// Input Handlers
// -------------------------------
document.querySelectorAll('input, select').forEach(input => {
  input.addEventListener('input', function() {
    saveState();
    if (this.type === 'range') {
      const numberInput = document.getElementById(this.id + 'Number');
      if (numberInput) numberInput.value = parseFloat(this.value).toFixed(1);
      const valueSpan = document.getElementById(this.id + 'Value');
      if (valueSpan) valueSpan.textContent = parseFloat(this.value).toFixed(1);
    } else if (this.id === 'layerRatioNumber') {
      const slider = document.getElementById('layerRatio');
      let value = parseFloat(this.value) || 0.1;
      value = Math.max(0.1, Math.min(10, value));
      this.value = value.toFixed(1);
      slider.value = value;
      const valueSpan = document.getElementById('layerRatioValue');
      if (valueSpan) valueSpan.textContent = value.toFixed(1);
    }
    if (this.id === 'scale' && !currentParams.audioReactive) {
      baseScale = parseFloat(this.value);
    }
    drawSpiral();
  });

  if (input.id === 'layerRatioNumber') {
    input.addEventListener('blur', function() {
      const slider = document.getElementById('layerRatio');
      const valueSpan = document.getElementById('layerRatioValue');
      let value = parseFloat(this.value) || 0.1;
      value = Math.max(0.1, Math.min(10, value));
      this.value = value.toFixed(1);
      slider.value = value;
      if (valueSpan) valueSpan.textContent = value.toFixed(1);
      drawSpiral();
    });
  }
});

// -------------------------------
// Auto-Rotate Animation
// -------------------------------
function animateRotation() {
  if (currentParams.autoRotate) {
    let rotationInput = document.getElementById('rotation');
    let currentRotation = parseFloat(rotationInput.value);
    currentRotation = (currentRotation + 1) % 360;
    rotationInput.value = currentRotation;
    document.getElementById('rotationValue').textContent = Math.round(currentRotation);
    drawSpiral();
    requestAnimationFrame(animateRotation);
  }
}

document.getElementById('autoRotate').addEventListener('change', function() {
  currentParams.autoRotate = this.checked;
  if (this.checked) animateRotation();
  else drawSpiral();
});

// -------------------------------
// Audio Reactive Setup
// -------------------------------
let audioContext, analyser, dataArray;

async function initAudio() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.3;
    source.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    console.log('Audio initialized');
  } catch (err) {
    console.error('Error accessing microphone:', err);
    alert('Couldn’t access microphone. Please allow mic permissions.');
  }
}

function getAudioAmplitude() {
  if (!analyser) return 0;
  analyser.getByteTimeDomainData(dataArray);
  let max = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const a = Math.abs(dataArray[i] / 128 - 1);
    max = Math.max(max, a);
  }
  return max;
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function animateAudioReactive() {
  if (currentParams.audioReactive) {
    const amplitude = getAudioAmplitude();
    const scaleInput = document.getElementById('scale');
    const rotationInput = document.getElementById('rotation');
    const opacityInput = document.getElementById('opacity');

    if (currentParams.audioRotate) {
      let baseRotation = parseFloat(rotationInput.value) || 0;
      const fluctuation = amplitude * 180;
      rotationInput.value = (baseRotation + fluctuation) % 360;
      document.getElementById('rotationValue').textContent = Math.round(rotationInput.value);
    }

    if (currentParams.audioScale) {
      const currentScale = parseFloat(scaleInput.value);
      let targetScale;
      if (amplitude > 0.05) {
        const adjustedAmplitude = amplitude * currentParams.scaleSensitivity;
        targetScale = baseScale + (adjustedAmplitude * currentParams.scaleGap);
        targetScale = Math.min(Math.max(targetScale, baseScale), baseScale + currentParams.scaleGap);
      } else {
        targetScale = baseScale;
      }
      const newScale = lerp(currentScale, targetScale, 0.1);
      scaleInput.value = newScale;
      document.getElementById('scaleValue').textContent = newScale.toFixed(1);
    }

    if (currentParams.audioOpacity) {
      const baseOpacity = parseFloat(opacityInput.value) || 1;
      const fluctuation = amplitude * 0.5;
      opacityInput.value = Math.min(Math.max(baseOpacity - fluctuation + 0.5, 0), 1);
      document.getElementById('opacityValue').textContent = opacityInput.value;
    }

    drawSpiral();
    requestAnimationFrame(animateAudioReactive);
  }
}

document.getElementById('audioReactive').addEventListener('change', function() {
  currentParams.audioReactive = this.checked;
  document.getElementById('audioOptions').style.display = this.checked ? 'block' : 'none';
  if (this.checked && !audioContext) {
    baseScale = parseFloat(document.getElementById('scale').value);
    initAudio().then(() => {
      animateAudioReactive();
    });
  } else if (this.checked) {
    baseScale = parseFloat(document.getElementById('scale').value);
    animateAudioReactive();
  } else {
    document.getElementById('scale').value = baseScale;
    document.getElementById('scaleValue').textContent = baseScale.toFixed(1);
    drawSpiral();
  }
});

document.getElementById('audioScale').addEventListener('change', function() {
  currentParams.audioScale = this.checked;
  if (!this.checked) {
    document.getElementById('scale').value = baseScale;
    document.getElementById('scaleValue').textContent = baseScale.toFixed(1);
  }
  drawSpiral();
});

document.getElementById('audioRotate').addEventListener('change', function() {
  currentParams.audioRotate = this.checked;
  drawSpiral();
});

document.getElementById('audioOpacity').addEventListener('change', function() {
  currentParams.audioOpacity = this.checked;
  drawSpiral();
});

document.getElementById('scaleGap')?.addEventListener('input', function() {
  currentParams.scaleGap = parseFloat(this.value);
  document.getElementById('scaleGapValue').textContent = this.value;
  drawSpiral();
});

document.getElementById('scaleSensitivity')?.addEventListener('input', function() {
  currentParams.scaleSensitivity = parseFloat(this.value);
  document.getElementById('scaleSensitivityValue').textContent = this.value;
  drawSpiral();
});

// Allow manual adjustments during audio reactivity
['scale', 'opacity'].forEach(id => {
  const input = document.getElementById(id);
  input.addEventListener('input', function() {
    if (currentParams.audioReactive && id === 'scale' && !currentParams.audioScale) {
      baseScale = parseFloat(this.value);
    }
    document.getElementById(id + 'Value').textContent = id === 'opacity' ? this.value : parseFloat(this.value).toFixed(1);
    drawSpiral();
  });
});

// -------------------------------
// Controls Toggle
// -------------------------------
const controlsOverlay = document.getElementById('controlsOverlay');
const toggleButton = document.getElementById('toggleControls');
const controlsNotice = document.createElement('div');
controlsNotice.id = 'controlsNotice';
controlsNotice.className = 'controls-notice';
document.body.appendChild(controlsNotice);

toggleButton.addEventListener('click', function() {
  if (controlsOverlay.style.display === 'none') {
    controlsOverlay.style.display = 'block';
    this.textContent = 'Hide Controls';
  } else {
    controlsOverlay.style.display = 'none';
    this.textContent = 'Show Controls';
    showControlsNotice();
  }
});

canvas.addEventListener('click', function(e) {
  if (controlsOverlay.style.display === 'none' && !document.fullscreenElement) {
    controlsOverlay.style.display = 'block';
    toggleButton.textContent = 'Hide Controls';
  }
});

function showControlsNotice() {
  controlsNotice.textContent = 'Click anywhere to show controls';
  controlsNotice.style.display = 'block';
  setTimeout(() => {
    controlsNotice.style.display = 'none';
  }, 3000);
}

// -------------------------------
// Mobile Touch Controls
// -------------------------------
let initialPinchDistance = null;
let initialScale = null;
let touchStartTime = null;
const TAP_THRESHOLD = 200;

canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

function handleTouchStart(e) {
  if (document.fullscreenElement && isMobile) {
    touchStartTime = Date.now();
  }
  if (e.touches.length === 2) {
    initialPinchDistance = Math.hypot(
      e.touches[0].pageX - e.touches[1].pageX,
      e.touches[0].pageY - e.touches[1].pageY
    );
    initialScale = parseFloat(document.getElementById('scale').value);
  }
}

function handleTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 2 && initialPinchDistance) {
    const currentDistance = Math.hypot(
      e.touches[0].pageX - e.touches[1].pageX,
      e.touches[0].pageY - e.touches[1].pageY
    );
    const scaleInput = document.getElementById('scale');
    const newScale = initialScale * (currentDistance / initialPinchDistance);
    scaleInput.value = Math.min(Math.max(newScale, 1), 100);
    if (!currentParams.audioReactive || !currentParams.audioScale) {
      baseScale = parseFloat(scaleInput.value);
    }
    document.getElementById('scaleValue').textContent = parseFloat(scaleInput.value).toFixed(1);
    saveState();
    drawSpiral();
  } else if (e.touches.length === 1) {
    const rotationInput = document.getElementById('rotation');
    const deltaX = e.touches[0].pageX - (e.touches[0].pageX - e.touches[0].movementX || 0);
    rotationInput.value = (parseFloat(rotationInput.value) + deltaX * 0.5) % 360;
    document.getElementById('rotationValue').textContent = Math.round(rotationInput.value);
    saveState();
    drawSpiral();
  }
}

function handleTouchEnd(e) {
  if (document.fullscreenElement && isMobile && e.touches.length === 0) {
    const touchDuration = Date.now() - touchStartTime;
    if (touchDuration < TAP_THRESHOLD && initialPinchDistance === null) {
      document.exitFullscreen();
    }
  }
  initialPinchDistance = null;
}

// -------------------------------
// Download Function
// -------------------------------
function downloadCanvas() {
  const downloadCanvas = document.createElement('canvas');
  downloadCanvas.width = 2160;
  downloadCanvas.height = 2160;
  const downloadGl = downloadCanvas.getContext('webgl', { preserveDrawingBuffer: true });
  if (!downloadGl) throw new Error('WebGL not supported for download');

  const downloadVertexShader = createShader(downloadGl, downloadGl.VERTEX_SHADER, vertexShaderSource);
  const downloadFragmentShader = createShader(downloadGl, downloadGl.FRAGMENT_SHADER, fragmentShaderSource);
  const downloadProgram = downloadGl.createProgram();
  downloadGl.attachShader(downloadProgram, downloadVertexShader);
  downloadGl.attachShader(downloadProgram, downloadFragmentShader);
  downloadGl.linkProgram(downloadProgram);
  if (!downloadGl.getProgramParameter(downloadProgram, downloadGl.LINK_STATUS)) {
    console.error(downloadGl.getProgramInfoLog(downloadProgram));
  }
  downloadGl.useProgram(downloadProgram);

  const dlPositionBuffer = downloadGl.createBuffer();
  const dlDistanceBuffer = downloadGl.createBuffer();
  const dlWidthBuffer = downloadGl.createBuffer();
  const dlNormalBuffer = downloadGl.createBuffer();
  const dlPositionLocation = downloadGl.getAttribLocation(downloadProgram, 'a_position');
  const dlDistanceLocation = downloadGl.getAttribLocation(downloadProgram, 'a_distance');
  const dlWidthLocation = downloadGl.getAttribLocation(downloadProgram, 'a_width');
  const dlNormalLocation = downloadGl.getAttribLocation(downloadProgram, 'a_normal');
  downloadGl.enableVertexAttribArray(dlPositionLocation);
  downloadGl.enableVertexAttribArray(dlDistanceLocation);
  downloadGl.enableVertexAttribArray(dlWidthLocation);
  downloadGl.enableVertexAttribArray(dlNormalLocation);

  downloadGl.bindBuffer(downloadGl.ARRAY_BUFFER, dlPositionBuffer);
  downloadGl.vertexAttribPointer(dlPositionLocation, 2, downloadGl.FLOAT, false, 0, 0);
  downloadGl.bindBuffer(downloadGl.ARRAY_BUFFER, dlDistanceBuffer);
  downloadGl.vertexAttribPointer(dlDistanceLocation, 1, downloadGl.FLOAT, false, 0, 0);
  downloadGl.bindBuffer(downloadGl.ARRAY_BUFFER, dlWidthBuffer);
  downloadGl.vertexAttribPointer(dlWidthLocation, 1, downloadGl.FLOAT, false, 0, 0);
  downloadGl.bindBuffer(downloadGl.ARRAY_BUFFER, dlNormalBuffer);
  downloadGl.vertexAttribPointer(dlNormalLocation, 2, downloadGl.FLOAT, false, 0, 0);

  downloadGl.uniform2f(downloadGl.getUniformLocation(downloadProgram, 'u_resolution'), downloadCanvas.width, downloadCanvas.height);
  downloadGl.uniform1f(downloadGl.getUniformLocation(downloadProgram, 'u_dashSize'), 5.0);
  downloadGl.uniform1f(downloadGl.getUniformLocation(downloadProgram, 'u_gapSize'), 5.0);
  downloadGl.uniform1i(downloadGl.getUniformLocation(downloadProgram, 'u_dashEnabled'), currentParams.dashEffect ? 1 : 0);
  downloadGl.uniform1i(downloadGl.getUniformLocation(downloadProgram, 'u_gradientEnabled'), currentParams.gradientStroke ? 1 : 0);
  downloadGl.uniform1i(downloadGl.getUniformLocation(downloadProgram, 'u_lineEndStyle'), currentParams.lineEndStyle === 'boxed' ? 0 : currentParams.lineEndStyle === 'tapered' ? 1 : 2);
  downloadGl.uniform1f(downloadGl.getUniformLocation(downloadProgram, 'u_lineWidth'), currentParams.lineWidth);

  drawSpiralOnContext(downloadGl, downloadCanvas.width, downloadCanvas.height, currentParams);

  downloadGl.finish();

  const link = document.createElement('a');
  link.download = 'kathara-spiral.png';
  link.href = downloadCanvas.toDataURL('image/png');
  link.click();
}

// -------------------------------
// Ratio Buttons
// -------------------------------
function setRatio(ratio) {
  document.getElementById('layerRatio').value = ratio;
  document.getElementById('layerRatioNumber').value = ratio.toFixed(1);
  document.getElementById('layerRatioValue').textContent = ratio.toFixed(1);
  saveState();
  drawSpiral();
}

// -------------------------------
// Fullscreen Handling
// -------------------------------
const fullscreenButton = document.getElementById('fullscreenButton');
const fullscreenOverlay = document.getElementById('fullscreenOverlay');
const isMobile = 'ontouchstart' in window || window.innerWidth < 768;

fullscreenButton.addEventListener('click', () => {
  if (canvas.requestFullscreen) {
    canvas.requestFullscreen();
    showFullscreenOverlay();
    controlsOverlay.style.display = 'none';
  }
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) {
    fullscreenOverlay.style.display = 'none';
    controlsOverlay.style.display = 'block';
    toggleButton.textContent = 'Hide Controls';
  }
});

function showFullscreenOverlay() {
  fullscreenOverlay.textContent = isMobile ? 'Tap to exit full screen' : 'Press ESC to exit full screen';
  fullscreenOverlay.style.display = 'block';
  setTimeout(() => {
    fullscreenOverlay.style.display = 'none';
  }, 3000);
}

// Initial draw
drawSpiral();
