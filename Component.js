<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1080, initial-scale=1.0" />
  <title>Digital Dot Globe</title>
  <style>
    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      width: 550px;
      height: 500px;
      overflow: show;
      background: #ffffff;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      position: relative;
    }

    #embed {
      position: relative;
      width: 550px;
      height: 500px;
      overflow: hidden;
      background: #ffffff;
    }

    canvas {
      display: block;
      width: 550px;
      height: 500px;
    }

    #hint {
      position: absolute;
      bottom: 26px;
      left: 50%;
      transform: translateX(-50%);
      color: rgba(40, 60, 75, 0.55);
      font-size: 11px;
      letter-spacing: 0.12em;
      pointer-events: none;
      z-index: 10;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div id="embed"></div>

  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/"
    }
  }
  </script>

  <script type="module">
    import * as THREE from "three";
    import { OrbitControls } from "three/addons/controls/OrbitControls.js";

    const WIDTH = 500;
    const HEIGHT = 500;

    const CONFIG = {
      radius: 1,
      step: 1.5,
      dotScale: 0.0062,
      oceanDotScale: 0.0030,
      oceanJitter: 0.0007
    };

    const container = document.getElementById("embed");

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const camera = new THREE.PerspectiveCamera(38, WIDTH / HEIGHT, 0.1, 100);
    camera.position.set(0, 0, 3.15);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(WIDTH, HEIGHT);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.045;
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.rotateSpeed = 0.45;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;

    const globe = new THREE.Group();
    scene.add(globe);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    const worldURL = "https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json";
    const topojson = await import("https://cdn.jsdelivr.net/npm/topojson-client@3/+esm");
    const response = await fetch(worldURL);
    const topology = await response.json();
    const land = topojson.feature(topology, topology.objects.land);

    const MASK_WIDTH = 2048;
    const MASK_HEIGHT = 1024;

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = MASK_WIDTH;
    maskCanvas.height = MASK_HEIGHT;
    const ctx = maskCanvas.getContext("2d");

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, MASK_WIDTH, MASK_HEIGHT);

    function project(longitude, latitude) {
      return {
        x: ((longitude + 180) / 360) * MASK_WIDTH,
        y: ((90 - latitude) / 180) * MASK_HEIGHT
      };
    }

    ctx.fillStyle = "#fff";

    function drawPolygon(rings) {
      ctx.beginPath();

      for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
          const p = project(ring[i][0], ring[i][1]);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
      }

      ctx.fill("evenodd");
    }

    for (const feature of land.features) {
      if (feature.geometry.type === "Polygon") {
        drawPolygon(feature.geometry.coordinates);
      } else if (feature.geometry.type === "MultiPolygon") {
        for (const polygon of feature.geometry.coordinates) {
          drawPolygon(polygon);
        }
      }
    }

    const pixels = ctx.getImageData(0, 0, MASK_WIDTH, MASK_HEIGHT).data;

    function isLand(longitude, latitude) {
      let x = Math.floor(((longitude + 180) / 360) * MASK_WIDTH);
      let y = Math.floor(((90 - latitude) / 180) * MASK_HEIGHT);

      x = Math.max(0, Math.min(MASK_WIDTH - 1, x));
      y = Math.max(0, Math.min(MASK_HEIGHT - 1, y));

      const index = (y * MASK_WIDTH + x) * 4;
      return pixels[index] > 128;
    }

    function geoToVector(latitude, longitude, radius) {
      const lat = THREE.MathUtils.degToRad(latitude);
      const lon = THREE.MathUtils.degToRad(longitude);

      return new THREE.Vector3(
        radius * Math.cos(lat) * Math.cos(lon),
        radius * Math.sin(lat),
        radius * Math.cos(lat) * Math.sin(lon)
      );
    }

    const landPoints = [];
    const oceanPoints = [];

    for (let lat = -89; lat <= 89; lat += CONFIG.step) {
      const row = Math.round((lat + 90) / CONFIG.step);
      const offset = row % 2 === 0 ? 0 : CONFIG.step * 0.5;

      for (let lon = -180; lon < 180; lon += CONFIG.step) {
        const sampleLon = lon + offset;
        const landSample = isLand(sampleLon, lat);

        if (landSample) {
          landPoints.push(geoToVector(lat, sampleLon, CONFIG.radius + 0.002));
        } else {
          oceanPoints.push(geoToVector(lat, sampleLon, CONFIG.radius));
        }
      }
    }

    const dotGeometry = new THREE.SphereGeometry(1, 6, 6);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    const oceanMaterial = new THREE.MeshBasicMaterial({
      color: 0xd9eef8
    });

    const oceanDots = new THREE.InstancedMesh(
      dotGeometry,
      oceanMaterial,
      oceanPoints.length
    );

    for (let i = 0; i < oceanPoints.length; i++) {
      const p = oceanPoints[i];
      const intensity = 0.92 + Math.random() * 0.05;
      const scale = CONFIG.oceanDotScale + (Math.random() - 0.5) * CONFIG.oceanJitter;

      dummy.position.copy(p);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      oceanDots.setMatrixAt(i, dummy.matrix);

      color.setRGB(
        0.84 * intensity,
        0.92 * intensity,
        0.97 * intensity
      );
      oceanDots.setColorAt(i, color);
    }

    oceanDots.instanceMatrix.needsUpdate = true;
    if (oceanDots.instanceColor) oceanDots.instanceColor.needsUpdate = true;
    globe.add(oceanDots);

    const landMaterial = new THREE.MeshBasicMaterial({
      color: 0x4a97c9
    });

    const landDots = new THREE.InstancedMesh(
      dotGeometry,
      landMaterial,
      landPoints.length
    );

    for (let i = 0; i < landPoints.length; i++) {
      const p = landPoints[i];
      const intensity = 0.9 + Math.random() * 0.1;

      dummy.position.copy(p);
      dummy.scale.setScalar(CONFIG.dotScale);
      dummy.updateMatrix();
      landDots.setMatrixAt(i, dummy.matrix);

      color.setRGB(
        0.24 * intensity,
        0.56 * intensity,
        0.80 * intensity
      );
      landDots.setColorAt(i, color);
    }

    landDots.instanceMatrix.needsUpdate = true;
    if (landDots.instanceColor) landDots.instanceColor.needsUpdate = true;
    globe.add(landDots);

    globe.rotation.y = THREE.MathUtils.degToRad(-20);
    globe.rotation.x = THREE.MathUtils.degToRad(5);

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }

    animate();
  </script>
</body>
</html>