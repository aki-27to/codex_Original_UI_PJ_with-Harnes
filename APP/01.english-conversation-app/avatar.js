const MODEL_URL = "./assets/models/cute_robot_loop.glb";
const MODULE_LOAD_TIMEOUT_MS = 12000;
const MODEL_LOAD_TIMEOUT_MS = 20000;

const LOCAL_VENDOR_RUNTIME_SOURCE = {
  source: "local-vendor",
  three: "./vendor/three.module.js",
  gltfLoader: "./vendor/three/addons/loaders/GLTFLoader.js",
  threeVrm: "./vendor/three-vrm.module.js",
};

const bridge = window.__avatarBridge && typeof window.__avatarBridge === "object" ? window.__avatarBridge : {};
window.__avatarBridge = bridge;

const stage = document.getElementById("avatarStage");
const canvas = document.getElementById("avatarCanvas");
const statusEl = document.getElementById("avatarStatus");

let renderer = null;
let scene = null;
let camera = null;
let clock = null;
let vrm = null;
let modelRoot = null;
let modelMixer = null;
let modelClips = [];
let modelType = "unknown";
let resizeObserver = null;
let frameId = 0;
let floorMesh = null;
let idleBaseY = -1.04;
let idleBaseRotationY = 0;
let gltfProcedural = null;
const CAMERA_DISTANCE_FACTOR_VRM = 0.54;
const CAMERA_DISTANCE_FACTOR_GLTF = 1.0;
const ARM_RELAX_Z = 1.36;
const FOREARM_RELAX_Z = 0.2;

let talking = false;
let mouthLevel = 0;

let blinkTimer = 0;
let blinkCooldown = 2.2;
let blinkFrames = 0;

let audioElementRef = null;
let audioContextRef = null;
let audioSourceRef = null;
let analyserRef = null;
let analyserBufferRef = null;
let liveAudioLevel = 0;
let speechCueLevel = 0;
let speechCueDecayPerSecond = 0;

bridge.booted = true;
bridge.ready = false;
bridge.error = false;
bridge.mode = "init";
bridge.modelUrl = MODEL_URL;
bridge.lastStatus = "";
bridge.lastError = "";
bridge.moduleLoadTimeoutMs = MODULE_LOAD_TIMEOUT_MS;
bridge.modelLoadTimeoutMs = MODEL_LOAD_TIMEOUT_MS;
bridge.remote3dFallback = false;
bridge.runtimeSource = "";
bridge.frameCount = 0;
bridge.lastFrameAt = 0;
bridge.modelBounds = null;
bridge.modelType = "unknown";
bridge.animationClips = [];
bridge.supportsExpressions = false;
bridge.audioLipSync = false;
bridge.moduleSources = [
  LOCAL_VENDOR_RUNTIME_SOURCE.source,
  "importmap",
];
bridge.setTalking = (value) => {
  talking = Boolean(value);
};
bridge.setAudioElement = (audioElement) => {
  bindAudioInput(audioElement || null);
};
bridge.pulseSpeech = (strength = 0.8, durationMs = 120) => {
  const safeStrength = Math.max(0, Math.min(1, Number(strength) || 0));
  const safeDurationMs = Math.max(40, Math.min(500, Math.trunc(Number(durationMs) || 120)));
  speechCueLevel = Math.max(speechCueLevel, safeStrength);
  speechCueDecayPerSecond = Math.max(3.5, 1000 / safeDurationMs);
};

function setStatus(message, kind = "ready") {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = kind === "error" ? "avatar-status error" : "avatar-status";
  bridge.lastStatus = String(message || "");
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(label || `timeout after ${ms}ms`));
    }, ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function clearAudioInputBinding() {
  bridge.audioLipSync = false;
  liveAudioLevel = 0;
  if (audioSourceRef) {
    try {
      audioSourceRef.disconnect();
    } catch {
    }
  }
  if (analyserRef) {
    try {
      analyserRef.disconnect();
    } catch {
    }
  }
  audioSourceRef = null;
  analyserRef = null;
  analyserBufferRef = null;
  audioElementRef = null;
}

function bindAudioInput(audioElement) {
  clearAudioInputBinding();
  if (!audioElement || typeof audioElement !== "object" || typeof window === "undefined") {
    return;
  }
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (typeof AudioContextCtor !== "function") {
    return;
  }
  try {
    audioContextRef = audioContextRef || new AudioContextCtor();
    if (audioContextRef.state === "suspended" && typeof audioContextRef.resume === "function") {
      audioContextRef.resume().catch(() => {});
    }
    const analyser = audioContextRef.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.65;
    const source = audioContextRef.createMediaElementSource(audioElement);
    source.connect(analyser);
    analyser.connect(audioContextRef.destination);
    analyserRef = analyser;
    audioSourceRef = source;
    analyserBufferRef = new Uint8Array(analyser.frequencyBinCount);
    audioElementRef = audioElement;
    bridge.audioLipSync = true;
  } catch (error) {
    clearAudioInputBinding();
    bridge.lastError = `audio-lipsync disabled: ${error && error.message ? error.message : String(error)}`;
  }
}

function sampleAudioMouthLevel(delta) {
  let measured = 0;
  if (analyserRef && analyserBufferRef && audioElementRef && !audioElementRef.paused && !audioElementRef.ended) {
    try {
      analyserRef.getByteFrequencyData(analyserBufferRef);
      let sum = 0;
      const maxBin = Math.min(32, analyserBufferRef.length);
      for (let i = 0; i < maxBin; i += 1) {
        sum += analyserBufferRef[i];
      }
      measured = (sum / Math.max(1, maxBin)) / 255;
    } catch {
      measured = 0;
    }
  }
  liveAudioLevel += (measured - liveAudioLevel) * Math.min(1, delta * 14);

  if (speechCueLevel > 0) {
    speechCueLevel = Math.max(0, speechCueLevel - speechCueDecayPerSecond * delta);
  }
  const mappedAudioLevel = Math.pow(Math.max(0, (liveAudioLevel - 0.03) * 2.8), 0.8);
  return Math.max(mappedAudioLevel, speechCueLevel);
}

function nextBlinkState(delta) {
  blinkTimer += delta;
  if (blinkFrames > 0) {
    blinkFrames -= 1;
    return 1;
  }
  if (blinkTimer > blinkCooldown) {
    blinkFrames = 4;
    blinkTimer = 0;
    blinkCooldown = 1.9 + Math.random() * 2.6;
  }
  return 0;
}

function nextMouthState(delta) {
  const syncInput = sampleAudioMouthLevel(delta);
  const baseline = talking ? 0.02 : 0;
  const target = Math.max(baseline, Math.min(1, syncInput));
  const followRate = syncInput > mouthLevel ? delta * 20 : delta * 10;
  mouthLevel += (target - mouthLevel) * Math.min(1, followRate);
  return Math.max(0, Math.min(1, mouthLevel));
}

function setExpressionValue(keys, value) {
  if (!vrm || !Array.isArray(keys)) return;
  const clamped = Math.max(0, Math.min(1, Number(value) || 0));

  if (vrm.expressionManager && typeof vrm.expressionManager.setValue === "function") {
    for (const key of keys) {
      try {
        vrm.expressionManager.setValue(key, clamped);
      } catch {
      }
    }
    return;
  }

  if (vrm.blendShapeProxy && typeof vrm.blendShapeProxy.setValue === "function") {
    for (const key of keys) {
      try {
        vrm.blendShapeProxy.setValue(key, clamped);
      } catch {
      }
    }
  }
}

function applyVrmMouthAndBlink(delta) {
  const mouthValue = nextMouthState(delta);
  setExpressionValue(["aa", "A"], mouthValue);
  setExpressionValue(["ih", "I"], mouthValue * 0.35);
  setExpressionValue(["ou", "U"], mouthValue * 0.28);
  setExpressionValue(["ee", "E"], mouthValue * 0.25);
  setExpressionValue(["oh", "O"], mouthValue * 0.32);

  const blink = nextBlinkState(delta);
  setExpressionValue(["blink", "Blink"], blink);
}

function findHumanoidBoneNode(...names) {
  if (!vrm || !vrm.humanoid || !names.length) return null;
  const humanoid = vrm.humanoid;
  for (const name of names) {
    if (!name) continue;
    try {
      if (typeof humanoid.getNormalizedBoneNode === "function") {
        const node = humanoid.getNormalizedBoneNode(name);
        if (node) return node;
      }
    } catch {
    }
    try {
      if (typeof humanoid.getRawBoneNode === "function") {
        const node = humanoid.getRawBoneNode(name);
        if (node) return node;
      }
    } catch {
    }
  }
  return null;
}

function applyComfortPose() {
  if (!vrm) return;
  // Relax VRM T-pose arms into a conversational neutral pose.
  const leftUpperArm = findHumanoidBoneNode("leftUpperArm", "LeftUpperArm");
  const rightUpperArm = findHumanoidBoneNode("rightUpperArm", "RightUpperArm");
  const leftLowerArm = findHumanoidBoneNode("leftLowerArm", "LeftLowerArm");
  const rightLowerArm = findHumanoidBoneNode("rightLowerArm", "RightLowerArm");

  if (leftUpperArm) {
    leftUpperArm.rotation.z -= ARM_RELAX_Z;
    leftUpperArm.rotation.x += 0.07;
    leftUpperArm.rotation.y += 0.04;
  }
  if (rightUpperArm) {
    rightUpperArm.rotation.z += ARM_RELAX_Z;
    rightUpperArm.rotation.x += 0.07;
    rightUpperArm.rotation.y -= 0.04;
  }
  if (leftLowerArm) {
    leftLowerArm.rotation.z -= FOREARM_RELAX_Z;
    leftLowerArm.rotation.x += 0.03;
  }
  if (rightLowerArm) {
    rightLowerArm.rotation.z += FOREARM_RELAX_Z;
    rightLowerArm.rotation.x += 0.03;
  }
}

function resize3d() {
  if (!renderer || !camera || !stage) return;
  const width = Math.max(300, Math.floor(stage.clientWidth || 1));
  const height = Math.max(220, Math.floor(stage.clientHeight || 1));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate3d() {
  if (!renderer || !scene || !camera || !clock || !modelRoot) return;
  const delta = Math.min(0.05, clock.getDelta());
  const elapsed = clock.elapsedTime;

  modelRoot.position.y = idleBaseY + Math.sin(elapsed * 1.2) * 0.01;
  modelRoot.rotation.y = idleBaseRotationY + Math.sin(elapsed * 0.65) * 0.08;

  if (vrm) {
    applyVrmMouthAndBlink(delta);
    if (typeof vrm.update === "function") {
      vrm.update(delta);
    }
  } else {
    if (modelMixer) {
      modelMixer.update(delta);
    }
    updateGltfProceduralMotion(delta, elapsed);
  }

  renderer.render(scene, camera);
  bridge.frameCount = Math.max(0, Math.trunc(Number(bridge.frameCount) || 0)) + 1;
  bridge.lastFrameAt = Date.now();
  frameId = window.requestAnimationFrame(animate3d);
}

function findNamedNode(root, name) {
  if (!root || !name) return null;
  let found = null;
  root.traverse((node) => {
    if (found || !node || !node.name) return;
    if (node.name === name) {
      found = node;
    }
  });
  return found;
}

function createAbsoluteRotationEntry(THREE, node) {
  if (!THREE || !node) return null;
  const baseEuler = new THREE.Euler().setFromQuaternion(node.quaternion.clone(), "XYZ");
  return {
    node,
    baseEuler,
    euler: new THREE.Euler(baseEuler.x, baseEuler.y, baseEuler.z, "XYZ"),
  };
}

function applyAbsoluteRotation(entry, x, y, z) {
  if (!entry || !entry.node) return;
  entry.euler.set(x, y, z);
  entry.node.quaternion.setFromEuler(entry.euler);
}

function createScaleEntry(node) {
  if (!node) return null;
  return {
    node,
    baseScaleX: node.scale.x,
    baseScaleY: node.scale.y,
    baseScaleZ: node.scale.z,
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function smoothTowards(current, target, speed, delta) {
  const s = Math.max(0.001, Number(speed) || 0.001);
  const dt = Math.max(0, Number(delta) || 0);
  const t = 1 - Math.exp(-s * dt);
  return current + (target - current) * t;
}

function startBlink(blink, quick = false) {
  if (!blink) return;
  blink.phase = "closing";
  blink.progress = 0;
  blink.closeDuration = (quick ? 0.048 : 0.072) + Math.random() * 0.04;
  blink.holdDuration = 0.015 + Math.random() * 0.035;
  blink.openDuration = (quick ? 0.07 : 0.11) + Math.random() * 0.055;
  const asym = (Math.random() - 0.5) * 0.2;
  blink.leftBias = asym;
  blink.rightBias = -asym * 0.82;
  blink.queuedDouble = !quick && Math.random() < 0.22;
}

function updateBlinkState(blink, delta) {
  if (!blink) return { leftClose: 0, rightClose: 0 };

  if (blink.phase === "idle") {
    blink.timer -= delta;
    if (blink.timer <= 0) {
      startBlink(blink, false);
    }
  }

  let baseClose = 0;
  if (blink.phase === "closing") {
    blink.progress += delta / Math.max(0.03, blink.closeDuration);
    if (blink.progress >= 1) {
      blink.phase = "hold";
      blink.progress = 0;
      baseClose = 1;
    } else {
      baseClose = clamp01(blink.progress);
    }
  } else if (blink.phase === "hold") {
    blink.progress += delta / Math.max(0.01, blink.holdDuration);
    baseClose = 1;
    if (blink.progress >= 1) {
      blink.phase = "opening";
      blink.progress = 0;
    }
  } else if (blink.phase === "opening") {
    blink.progress += delta / Math.max(0.04, blink.openDuration);
    baseClose = clamp01(1 - blink.progress);
    if (blink.progress >= 1) {
      if (blink.queuedDouble) {
        blink.queuedDouble = false;
        blink.phase = "gap";
        blink.progress = 0;
        blink.timer = 0.04 + Math.random() * 0.08;
      } else {
        blink.phase = "idle";
        blink.progress = 0;
        blink.timer = 1.8 + Math.random() * 2.8;
      }
      baseClose = 0;
    }
  } else if (blink.phase === "gap") {
    blink.timer -= delta;
    if (blink.timer <= 0) {
      startBlink(blink, true);
    }
    baseClose = 0;
  }

  const leftTarget = clamp01(baseClose + blink.leftBias);
  const rightTarget = clamp01(baseClose + blink.rightBias);
  blink.leftClose = smoothTowards(blink.leftClose, leftTarget, 26, delta);
  blink.rightClose = smoothTowards(blink.rightClose, rightTarget, 26, delta);
  return {
    leftClose: blink.leftClose,
    rightClose: blink.rightClose,
  };
}

function applyBlinkScale(entries, closeAmount) {
  const close = clamp01(closeAmount);
  if (!Array.isArray(entries) || !entries.length) return;
  const squashY = 1 - close * 0.9;
  const widenX = 1 + close * 0.08;
  for (const entry of entries) {
    if (!entry || !entry.node) continue;
    entry.node.scale.set(
      entry.baseScaleX * widenX,
      entry.baseScaleY * Math.max(0.05, squashY),
      entry.baseScaleZ
    );
  }
}

function setupGltfProceduralMotion(THREE) {
  gltfProcedural = null;
  if (!THREE || !modelRoot || modelType !== "gltf") return;

  const leftShoulder = createAbsoluteRotationEntry(THREE, findNamedNode(modelRoot, "REF_L_Shoulder"));
  const leftArmSeg = createAbsoluteRotationEntry(THREE, findNamedNode(modelRoot, "REF_L_ArmSeg"));
  const leftForearm = createAbsoluteRotationEntry(THREE, findNamedNode(modelRoot, "REF_L_Forearm"));
  const leftForearmBlue = createAbsoluteRotationEntry(THREE, findNamedNode(modelRoot, "REF_L_ForearmBlue"));
  const head = createAbsoluteRotationEntry(THREE, findNamedNode(modelRoot, "REF_Head"));
  const smile = createAbsoluteRotationEntry(THREE, findNamedNode(modelRoot, "REF_SmileCurve"));
  const leftFingerEntries = [
    createAbsoluteRotationEntry(THREE, findNamedNode(modelRoot, "REF_L_Finger_1")),
    createAbsoluteRotationEntry(THREE, findNamedNode(modelRoot, "REF_L_Finger_2")),
    createAbsoluteRotationEntry(THREE, findNamedNode(modelRoot, "REF_L_Finger_3")),
  ].filter(Boolean);

  const blinkLeftEntries = [
    createScaleEntry(findNamedNode(modelRoot, "REF_EyeRing_L")),
    createScaleEntry(findNamedNode(modelRoot, "REF_EyePupil_L")),
    createScaleEntry(findNamedNode(modelRoot, "REF_EyeHi_L")),
  ].filter(Boolean);

  const blinkRightEntries = [
    createScaleEntry(findNamedNode(modelRoot, "REF_EyeRing_R")),
    createScaleEntry(findNamedNode(modelRoot, "REF_EyePupil_R")),
    createScaleEntry(findNamedNode(modelRoot, "REF_EyeHi_R")),
  ].filter(Boolean);

  const rightMicroNodes = [
    findNamedNode(modelRoot, "REF_R_Shoulder"),
    findNamedNode(modelRoot, "REF_R_ArmSeg"),
    findNamedNode(modelRoot, "REF_R_Forearm"),
    findNamedNode(modelRoot, "REF_R_Finger_1"),
    findNamedNode(modelRoot, "REF_R_Finger_2"),
    findNamedNode(modelRoot, "REF_R_Finger_3"),
  ].filter(Boolean);

  gltfProcedural = {
    THREE,
    leftShoulder,
    leftArmSeg,
    leftForearm,
    leftForearmBlue,
    head,
    smile,
    leftFingerEntries,
    rightMicroNodes,
    blinkLeftEntries,
    blinkRightEntries,
    motion: {
      leftShoulderX: 0,
      leftShoulderY: 0,
      leftShoulderZ: 0,
      leftArmSegX: 0,
      leftArmSegY: 0,
      leftArmSegZ: 0,
      leftForearmX: 0,
      leftForearmY: 0,
      leftForearmZ: 0,
      leftForearmBlueX: 0,
      leftForearmBlueY: 0,
      leftForearmBlueZ: 0,
      fingerCurl: 0,
      headX: 0,
      headY: 0,
      headZ: 0,
      smileX: 0,
    },
    blink: {
      phase: "idle",
      timer: 1.2 + Math.random() * 2.1,
      progress: 0,
      closeDuration: 0.09,
      holdDuration: 0.03,
      openDuration: 0.12,
      leftBias: 0,
      rightBias: 0,
      leftClose: 0,
      rightClose: 0,
      queuedDouble: false,
    },
    tmpEuler: new THREE.Euler(0, 0, 0, "XYZ"),
    tmpQuat: new THREE.Quaternion(),
  };
}

function updateGltfProceduralMotion(delta, elapsed) {
  const proc = gltfProcedural;
  if (!proc || modelType !== "gltf") return;
  const m = proc.motion;
  const breathe = Math.sin(elapsed * 0.95);
  const idle = Math.sin(elapsed * 0.58 + 0.42);
  const handWave = Math.sin(elapsed * 1.28 + 0.62);
  const detail = Math.sin(elapsed * 0.27 + 1.34);
  const fingerCurlTarget = 0.11 + Math.sin(elapsed * 1.14 + 0.3) * 0.045 + detail * 0.016;

  m.leftShoulderX = smoothTowards(m.leftShoulderX, 0.065 + breathe * 0.028 + detail * 0.011, 9.5, delta);
  m.leftShoulderY = smoothTowards(m.leftShoulderY, idle * 0.048, 8.5, delta);
  m.leftShoulderZ = smoothTowards(m.leftShoulderZ, handWave * 0.072 + detail * 0.02, 10, delta);

  m.leftArmSegX = smoothTowards(m.leftArmSegX, 0.055 + Math.sin(elapsed * 1.06 + 0.18) * 0.03, 10, delta);
  m.leftArmSegY = smoothTowards(m.leftArmSegY, Math.sin(elapsed * 0.84 + 1.04) * 0.022, 8.4, delta);
  m.leftArmSegZ = smoothTowards(m.leftArmSegZ, Math.sin(elapsed * 1.14 + 1.08) * 0.052, 10.3, delta);

  m.leftForearmX = smoothTowards(m.leftForearmX, 0.105 + Math.sin(elapsed * 1.42 + 0.75) * 0.06, 11.4, delta);
  m.leftForearmY = smoothTowards(m.leftForearmY, Math.sin(elapsed * 0.92 + 0.2) * 0.02, 8.6, delta);
  m.leftForearmZ = smoothTowards(m.leftForearmZ, Math.sin(elapsed * 1.22 + 2.1) * 0.046, 10.6, delta);

  m.leftForearmBlueX = smoothTowards(m.leftForearmBlueX, 0.088 + Math.sin(elapsed * 1.24 + 1.4) * 0.052, 10.8, delta);
  m.leftForearmBlueY = smoothTowards(m.leftForearmBlueY, Math.sin(elapsed * 0.98 + 0.85) * 0.015, 8.2, delta);
  m.leftForearmBlueZ = smoothTowards(m.leftForearmBlueZ, Math.sin(elapsed * 1.18 + 2.6) * 0.04, 10.2, delta);

  m.fingerCurl = smoothTowards(m.fingerCurl, fingerCurlTarget, 13.5, delta);
  m.headX = smoothTowards(m.headX, Math.sin(elapsed * 0.44 + 0.33) * 0.018 + detail * 0.008, 6.8, delta);
  m.headY = smoothTowards(m.headY, Math.sin(elapsed * 0.36 + 1.2) * 0.048, 6.3, delta);
  m.headZ = smoothTowards(m.headZ, Math.sin(elapsed * 0.52 + 2.1) * 0.012, 6.9, delta);
  m.smileX = smoothTowards(m.smileX, Math.sin(elapsed * 1.02 + 0.2) * 0.013, 10.5, delta);

  if (proc.leftShoulder) {
    const b = proc.leftShoulder.baseEuler;
    applyAbsoluteRotation(
      proc.leftShoulder,
      b.x + m.leftShoulderX,
      b.y + m.leftShoulderY,
      b.z + m.leftShoulderZ
    );
  }
  if (proc.leftArmSeg) {
    const b = proc.leftArmSeg.baseEuler;
    applyAbsoluteRotation(
      proc.leftArmSeg,
      b.x + m.leftArmSegX,
      b.y + m.leftArmSegY,
      b.z + m.leftArmSegZ
    );
  }
  if (proc.leftForearm) {
    const b = proc.leftForearm.baseEuler;
    applyAbsoluteRotation(
      proc.leftForearm,
      b.x + m.leftForearmX,
      b.y + m.leftForearmY,
      b.z + m.leftForearmZ
    );
  }
  if (proc.leftForearmBlue) {
    const b = proc.leftForearmBlue.baseEuler;
    applyAbsoluteRotation(
      proc.leftForearmBlue,
      b.x + m.leftForearmBlueX,
      b.y + m.leftForearmBlueY,
      b.z + m.leftForearmBlueZ
    );
  }
  for (let i = 0; i < proc.leftFingerEntries.length; i += 1) {
    const entry = proc.leftFingerEntries[i];
    const b = entry.baseEuler;
    const phase = i * 0.4;
    applyAbsoluteRotation(
      entry,
      b.x + m.fingerCurl + Math.sin(elapsed * 1.28 + phase) * 0.028,
      b.y,
      b.z + Math.sin(elapsed * 1.04 + phase) * 0.024
    );
  }

  if (proc.head) {
    const b = proc.head.baseEuler;
    applyAbsoluteRotation(
      proc.head,
      b.x + m.headX,
      b.y + m.headY,
      b.z + m.headZ
    );
  }
  if (proc.smile) {
    const b = proc.smile.baseEuler;
    applyAbsoluteRotation(
      proc.smile,
      b.x + m.smileX,
      b.y,
      b.z
    );
  }

  // Add gentle low-frequency micro motion over baked right-arm clips.
  for (let i = 0; i < proc.rightMicroNodes.length; i += 1) {
    const node = proc.rightMicroNodes[i];
    const phase = i * 0.85;
    const micro = (
      Math.sin(elapsed * 1.08 + phase) * 0.007
      + Math.sin(elapsed * 0.34 + phase * 1.7) * 0.004
    );
    proc.tmpEuler.set(micro, 0, 0);
    proc.tmpQuat.setFromEuler(proc.tmpEuler);
    node.quaternion.multiply(proc.tmpQuat);
  }

  const blinkState = updateBlinkState(proc.blink, delta);
  applyBlinkScale(proc.blinkLeftEntries, blinkState.leftClose);
  applyBlinkScale(proc.blinkRightEntries, blinkState.rightClose);
}

async function loadThreeRuntimeFromImportMap() {
  const [THREE, { GLTFLoader }, { VRMLoaderPlugin, VRMUtils }] = await Promise.all([
    import("three"),
    import("three/addons/loaders/GLTFLoader.js"),
    import("@pixiv/three-vrm"),
  ]);
  return { source: "importmap", THREE, GLTFLoader, VRMLoaderPlugin, VRMUtils };
}

function resolveGltfLoader(moduleNamespace) {
  if (!moduleNamespace || typeof moduleNamespace !== "object") {
    return null;
  }
  if (typeof moduleNamespace.GLTFLoader === "function") {
    return moduleNamespace.GLTFLoader;
  }
  if (typeof moduleNamespace.default === "function") {
    return moduleNamespace.default;
  }
  if (moduleNamespace.default && typeof moduleNamespace.default.GLTFLoader === "function") {
    return moduleNamespace.default.GLTFLoader;
  }
  return null;
}

function resolveVrmRuntime(moduleNamespace) {
  if (!moduleNamespace || typeof moduleNamespace !== "object") {
    return { VRMLoaderPlugin: null, VRMUtils: null };
  }
  const defaultNamespace = moduleNamespace.default && typeof moduleNamespace.default === "object"
    ? moduleNamespace.default
    : null;

  const VRMLoaderPlugin = typeof moduleNamespace.VRMLoaderPlugin === "function"
    ? moduleNamespace.VRMLoaderPlugin
    : defaultNamespace && typeof defaultNamespace.VRMLoaderPlugin === "function"
      ? defaultNamespace.VRMLoaderPlugin
      : null;

  const VRMUtils = moduleNamespace.VRMUtils || (defaultNamespace && defaultNamespace.VRMUtils) || null;
  return { VRMLoaderPlugin, VRMUtils };
}

async function loadThreeRuntimeFromUrls(source) {
  if (!source || typeof source !== "object") {
    throw new Error("runtime source is invalid");
  }
  const threeUrl = String(source.three || "");
  const loaderUrl = String(source.gltfLoader || "");
  const vrmUrl = String(source.threeVrm || "");
  if (!threeUrl || !loaderUrl || !vrmUrl) {
    throw new Error(`runtime source ${source.source || "unknown"} is incomplete`);
  }

  const [THREE, gltfModule, vrmModule] = await Promise.all([
    import(threeUrl),
    import(loaderUrl),
    import(vrmUrl),
  ]);
  const GLTFLoader = resolveGltfLoader(gltfModule);
  const { VRMLoaderPlugin, VRMUtils } = resolveVrmRuntime(vrmModule);

  if (!THREE || typeof THREE.WebGLRenderer !== "function") {
    throw new Error(`runtime source ${source.source || "unknown"} returned invalid three module`);
  }
  if (typeof GLTFLoader !== "function") {
    throw new Error(`runtime source ${source.source || "unknown"} returned invalid GLTFLoader`);
  }
  if (typeof VRMLoaderPlugin !== "function") {
    throw new Error(`runtime source ${source.source || "unknown"} returned invalid VRMLoaderPlugin`);
  }

  return {
    source: source.source || "remote",
    THREE,
    GLTFLoader,
    VRMLoaderPlugin,
    VRMUtils,
  };
}

async function loadThreeRuntime() {
  const loaders = [
    () => loadThreeRuntimeFromUrls(LOCAL_VENDOR_RUNTIME_SOURCE),
    loadThreeRuntimeFromImportMap,
  ];
  const errors = [];
  for (const run of loaders) {
    try {
      return await withTimeout(run(), MODULE_LOAD_TIMEOUT_MS, "3D module load timeout");
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      errors.push(message.slice(0, 180));
    }
  }
  throw new Error(errors.join(" | "));
}

async function loadAvatarModel(runtime) {
  const { THREE, GLTFLoader, VRMLoaderPlugin, VRMUtils } = runtime;
  const loader = new GLTFLoader();
  if (typeof VRMLoaderPlugin === "function") {
    loader.register((parser) => new VRMLoaderPlugin(parser));
  }

  vrm = null;
  modelRoot = null;
  modelMixer = null;
  modelClips = [];
  modelType = "unknown";
  gltfProcedural = null;
  bridge.animationClips = [];
  bridge.supportsExpressions = false;

  const gltf = await loader.loadAsync(MODEL_URL);
  if (!gltf || typeof gltf !== "object") {
    throw new Error("3D model parse failed");
  }
  modelClips = Array.isArray(gltf.animations) ? gltf.animations : [];
  bridge.animationClips = modelClips.map((clip, index) => {
    if (!clip || typeof clip !== "object") return `clip_${index}`;
    const label = typeof clip.name === "string" ? clip.name.trim() : "";
    return label || `clip_${index}`;
  });

  if (gltf.userData && gltf.userData.vrm) {
    if (VRMUtils && typeof VRMUtils.removeUnnecessaryVertices === "function") {
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
    }
    if (VRMUtils && typeof VRMUtils.removeUnnecessaryJoints === "function") {
      VRMUtils.removeUnnecessaryJoints(gltf.scene);
    }
    vrm = gltf.userData.vrm;
    if (VRMUtils && typeof VRMUtils.rotateVRM0 === "function") {
      VRMUtils.rotateVRM0(vrm);
    }
    modelRoot = vrm.scene;
    modelType = "vrm";
    bridge.supportsExpressions = true;
    scene.add(modelRoot);
    return;
  }

  const fallbackScene = gltf.scene || (Array.isArray(gltf.scenes) ? gltf.scenes[0] : null);
  if (!fallbackScene) {
    throw new Error("GLB scene missing");
  }
  modelRoot = fallbackScene;
  modelType = "gltf";
  scene.add(modelRoot);

  if (modelClips.length && typeof THREE.AnimationMixer === "function") {
    modelMixer = new THREE.AnimationMixer(modelRoot);
    for (const clip of modelClips) {
      try {
        const action = modelMixer.clipAction(clip);
        action.enabled = true;
        action.clampWhenFinished = false;
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.setEffectiveWeight(0.95);
        action.setEffectiveTimeScale(0.96);
        action.play();
      } catch {
      }
    }
  }
}

function frameCameraToAvatarModel(THREE) {
  if (!modelRoot || !camera) return;

  const box = new THREE.Box3().setFromObject(modelRoot);
  if (box.isEmpty()) {
    return;
  }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Align avatar feet near the stage floor and keep a stable idle baseline.
  const floorY = -1.08;
  const liftY = floorY - box.min.y;
  modelRoot.position.y += liftY;
  idleBaseY = modelRoot.position.y;
  idleBaseRotationY = modelRoot.rotation ? modelRoot.rotation.y : 0;
  if (modelRoot.rotation) {
    modelRoot.rotation.y = idleBaseRotationY;
  }

  const adjustedBox = new THREE.Box3().setFromObject(modelRoot);
  const adjustedSize = adjustedBox.getSize(new THREE.Vector3());
  const adjustedCenter = adjustedBox.getCenter(new THREE.Vector3());
  const maxDim = Math.max(adjustedSize.x, adjustedSize.y, adjustedSize.z, 0.25);
  const fovRad = (camera.fov * Math.PI) / 180;
  const fitHeightDistance = (adjustedSize.y * 0.5) / Math.max(0.08, Math.tan(fovRad * 0.5));
  const fitWidthDistance = (adjustedSize.x * 0.5) / Math.max(0.08, Math.tan(fovRad * 0.5) * Math.max(0.2, camera.aspect));
  const fitDistance = Math.max(fitHeightDistance, fitWidthDistance, 0.45);
  const cameraDistance = fitDistance * (modelType === "vrm" ? CAMERA_DISTANCE_FACTOR_VRM : CAMERA_DISTANCE_FACTOR_GLTF);

  camera.near = Math.max(0.01, cameraDistance / 120);
  camera.far = Math.max(20, cameraDistance * 40);
  camera.position.set(
    adjustedCenter.x,
    adjustedCenter.y + adjustedSize.y * 0.22,
    adjustedCenter.z + cameraDistance
  );
  camera.lookAt(adjustedCenter.x, adjustedCenter.y + adjustedSize.y * 0.18, adjustedCenter.z);
  camera.updateProjectionMatrix();

  if (floorMesh) {
    floorMesh.position.y = adjustedBox.min.y - 0.02;
    floorMesh.scale.setScalar(Math.max(1, maxDim * 0.75));
  }

  bridge.modelBounds = {
    size: {
      x: Number(adjustedSize.x.toFixed(3)),
      y: Number(adjustedSize.y.toFixed(3)),
      z: Number(adjustedSize.z.toFixed(3)),
    },
    center: {
      x: Number(adjustedCenter.x.toFixed(3)),
      y: Number(adjustedCenter.y.toFixed(3)),
      z: Number(adjustedCenter.z.toFixed(3)),
    },
  };
  bridge.modelType = modelType;
}

async function start3d(runtime) {
  if (!canvas || !stage) {
    throw new Error("viewport missing");
  }
  const { THREE } = runtime;
  bridge.mode = "three-3d";

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0xf3f9ff, 1);
  if (Object.prototype.hasOwnProperty.call(renderer, "outputColorSpace")) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f9ff);

  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 1.4, 2.25);
  camera.lookAt(0, 1.25, 0);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x9db2c8, 1.2);
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(1.2, 2.2, 2.4);
  const fill = new THREE.DirectionalLight(0xbfdfff, 0.65);
  fill.position.set(-1.6, 1.4, -1.2);
  scene.add(hemi);
  scene.add(key);
  scene.add(fill);

  floorMesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.9, 64),
    new THREE.MeshStandardMaterial({
      color: 0xc8e4fb,
      transparent: true,
      opacity: 0.55,
      roughness: 1,
      metalness: 0,
    })
  );
  floorMesh.rotation.x = -Math.PI * 0.5;
  floorMesh.position.y = -1.06;
  scene.add(floorMesh);

  await withTimeout(loadAvatarModel(runtime), MODEL_LOAD_TIMEOUT_MS, "3D model load timeout");
  if (modelType === "vrm") {
    applyComfortPose();
  } else if (modelType === "gltf") {
    setupGltfProceduralMotion(THREE);
  }
  frameCameraToAvatarModel(THREE);
  resize3d();
  window.addEventListener("resize", resize3d);
  if (typeof window.ResizeObserver === "function") {
    resizeObserver = new window.ResizeObserver(() => resize3d());
    resizeObserver.observe(stage);
  }
  clock = new THREE.Clock();
  frameId = window.requestAnimationFrame(animate3d);
  bridge.ready = true;
  bridge.error = false;
  bridge.runtimeSource = runtime.source;
  bridge.mode = modelType === "vrm" ? "three-vrm" : "three-gltf";
  const clipSuffix = modelClips.length ? ` clips:${modelClips.length}` : "";
  setStatus(`Avatar: ready (${runtime.source}/${modelType}${clipSuffix}).`);
}

async function initAvatar() {
  if (!canvas || !stage) {
    bridge.error = true;
    setStatus("Avatar: viewport missing.", "error");
    return;
  }
  setStatus("Avatar: loading modules...");
  try {
    const runtime = await loadThreeRuntime();
    setStatus(`Avatar: loading model (${runtime.source})...`);
    await start3d(runtime);
  } catch (error) {
    const reason = error && error.message ? error.message : "3D init failed";
    bridge.error = true;
    bridge.ready = false;
    bridge.mode = "error";
    bridge.lastError = String(reason || "");
    if (statusEl) {
      statusEl.title = bridge.lastError;
    }
    console.error("[avatar] 3D initialization failed:", bridge.lastError);
    setStatus("Avatar: failed to initialize 3D runtime.", "error");
  }
}

window.addEventListener("beforeunload", () => {
  if (frameId) {
    window.cancelAnimationFrame(frameId);
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
  if (renderer) {
    try {
      renderer.dispose();
    } catch {
    }
  }
  clearAudioInputBinding();
  if (audioContextRef && typeof audioContextRef.close === "function") {
    try {
      audioContextRef.close();
    } catch {
    }
  }
});

initAvatar().catch((error) => {
  const message = error && error.message ? error.message : "Avatar initialization failed";
  bridge.error = true;
  bridge.ready = false;
  bridge.mode = "error";
  bridge.lastError = String(message || "");
  if (statusEl) {
    statusEl.title = bridge.lastError;
  }
  console.error("[avatar] unhandled initialization failure:", bridge.lastError);
  setStatus("Avatar: failed to initialize 3D runtime.", "error");
});
