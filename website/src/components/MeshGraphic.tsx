// SPDX-License-Identifier: AGPL-3.0-only
// Adapted from bitsocialnet/bitsocial-web, about/src/components/mesh-graphic/index.tsx (efec9611).
// Modified 2026-10-11 for the Hooks docs: Astro theme, layout, and motion preferences.
// Upstream license and attribution: website/LICENSES/bitsocial-web-AGPL-3.0.txt.
import { useCallback, useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { getHeroGraphicMaxPixelRatio, getIsMobileHeroGraphicLayout } from "../lib/mesh/performance";
import { useWebGLContextRecovery } from "../lib/mesh/useWebGLContextRecovery";
import "./MeshGraphic.css";

interface Node {
  position: THREE.Vector3;
  basePosition: THREE.Vector3;
}

const CONNECTION_SEARCH_PADDING = 0.75;
const DESKTOP_MESH_MIN_WIDTH = 768;
const DESKTOP_MESH_MAX_WIDTH = 1440;
const DESKTOP_MESH_NODE_MIN_SIZE = 0.024;
const DESKTOP_MESH_NODE_MAX_SIZE = 0.042;
const MOBILE_MESH_NODE_COUNT = 56;
const DESKTOP_MESH_NODE_MIN_COUNT = 120;
const DESKTOP_MESH_NODE_MAX_COUNT = 180;
const RESIZE_DEBOUNCE_MS = 140;
const MOBILE_FRAME_BUDGET_MS = 33;

function getIsMobileLayout(width: number) {
  return getIsMobileHeroGraphicLayout(width);
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getDesktopMeshViewportProgress(width: number) {
  return clamp(
    (width - DESKTOP_MESH_MIN_WIDTH) / (DESKTOP_MESH_MAX_WIDTH - DESKTOP_MESH_MIN_WIDTH),
    0,
    1,
  );
}

function getMeshNodeSize(width: number, isMobileLayout: boolean) {
  if (isMobileLayout) return 0.03;

  const progress = getDesktopMeshViewportProgress(width);

  return lerp(DESKTOP_MESH_NODE_MIN_SIZE, DESKTOP_MESH_NODE_MAX_SIZE, progress);
}

function getMeshNodeCount(width: number, isMobileLayout: boolean) {
  if (isMobileLayout) return MOBILE_MESH_NODE_COUNT;

  return Math.round(
    lerp(
      DESKTOP_MESH_NODE_MIN_COUNT,
      DESKTOP_MESH_NODE_MAX_COUNT,
      getDesktopMeshViewportProgress(width),
    ),
  );
}

/**
 * gl_PointSize is in device pixels. Keep ~1x displays slightly larger so lower-density external
 * monitors do not end up with nodes that feel too fine, while Retina remains unchanged.
 */
function meshPointPixelScale(dpr: number) {
  const t = Math.min(dpr, 2) / 2;
  return 0.5 + 0.5 * t;
}

function seededUnitInterval(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453123;
  return value - Math.floor(value);
}

function seededSignedUnit(seed: number) {
  return seededUnitInterval(seed) * 2 - 1;
}

function getVisibleMeshWidth(width: number, height: number) {
  const visibleHeight = 2 * Math.tan((50 * Math.PI) / 360) * 30;
  return visibleHeight * (width / height);
}

function layoutMeshNodes(nodes: Node[], width: number, height: number, isMobileLayout: boolean) {
  const visibleWidth = getVisibleMeshWidth(width, height);
  const uWidth = visibleWidth + 8;
  const uDepth = 8;
  const bottomY = -10;
  const topY = isMobileLayout ? 15 : 10;
  const gridCols = Math.ceil(Math.sqrt(nodes.length * (uWidth / (topY - bottomY))));
  const gridRows = Math.ceil(nodes.length / gridCols);
  const cellWidth = uWidth / Math.max(gridCols, 1);
  const cellHeight = (topY - bottomY) / Math.max(gridRows, 1);

  for (let i = 0; i < nodes.length; i++) {
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);
    const baseX = -uWidth / 2 + (col / Math.max(gridCols - 1, 1)) * uWidth;
    const baseY = bottomY + (row / Math.max(gridRows - 1, 1)) * (topY - bottomY);
    const jitterX = seededSignedUnit(i * 4 + 0.11) * cellWidth * 0.4;
    const jitterY = seededSignedUnit(i * 4 + 1.23) * cellHeight * 0.4;

    const x = baseX + jitterX;
    const y = baseY + jitterY;
    let z = -3 + seededSignedUnit(i * 4 + 2.37) * (uDepth / 2);

    if (y < bottomY + 2) {
      z = -5 + seededSignedUnit(i * 4 + 3.41) * 2;
    }

    nodes[i].basePosition.set(x, y, z);
    nodes[i].position.copy(nodes[i].basePosition);
  }
}

function syncPointPositions(pointPositions: Float32Array, nodes: Node[]) {
  for (let i = 0; i < nodes.length; i++) {
    pointPositions[i * 3] = nodes[i].position.x;
    pointPositions[i * 3 + 1] = nodes[i].position.y;
    pointPositions[i * 3 + 2] = nodes[i].position.z;
  }
}

function buildCandidatePairs(nodes: Node[], candidateConnectionDistanceSq: number) {
  const candidatePairs: number[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const nodeA = nodes[i].basePosition;
    for (let j = i + 1; j < nodes.length; j++) {
      const nodeB = nodes[j].basePosition;
      const dx = nodeA.x - nodeB.x;
      const dy = nodeA.y - nodeB.y;
      const dz = nodeA.z - nodeB.z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < candidateConnectionDistanceSq) {
        candidatePairs.push(i, j);
      }
    }
  }

  return candidatePairs;
}

function getViewportResizeKey(container: HTMLDivElement) {
  const viewport = window.visualViewport;
  return [
    container.clientWidth,
    container.clientHeight,
    window.devicePixelRatio,
    viewport?.width ?? 0,
    viewport?.height ?? 0,
    viewport?.scale ?? 1,
  ].join(":");
}

export default function MeshGraphic() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Stable server/client values; actual container dimensions are read after hydration.
  const [isMobile, setIsMobile] = useState(false);
  const [meshNodeCount, setMeshNodeCount] = useState(MOBILE_MESH_NODE_COUNT);
  const [hasFailed, setHasFailed] = useState(false);
  const handleInitError = useCallback(() => setHasFailed(true), []);
  const { contextGeneration, handleContextLost, registerContext, requestContextRecovery } =
    useWebGLContextRecovery(handleInitError);

  useEffect(() => {
    if (hasFailed || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!container.clientWidth || !container.clientHeight) return;
    const sceneIsMobile = getIsMobileLayout(container.clientWidth || window.innerWidth);
    const sceneNodeCount = getMeshNodeCount(
      container.clientWidth || window.innerWidth,
      sceneIsMobile,
    );

    if (sceneIsMobile !== isMobile) {
      setIsMobile(sceneIsMobile);
      return;
    }

    if (sceneNodeCount !== meshNodeCount) {
      setMeshNodeCount(sceneNodeCount);
      return;
    }

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    // Shift camera up to create empty space at top of canvas (nodes won't be cut off)
    // Mobile needs more offset to prevent clipping, desktop needs less to show more mesh
    const cameraYOffset = isMobile ? 4 : 0;
    camera.position.set(0, cameraYOffset, 30);
    camera.lookAt(0, cameraYOffset, 0);

    // Renderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !isMobile,
        powerPreference: isMobile ? "low-power" : "default",
      });
    } catch {
      // The GPU process can still be coming back when a long-backgrounded tab
      // resumes, so let the recovery hook retry before giving up on the scene.
      requestContextRecovery();
      return;
    }
    const onContextLost = (event: Event) => {
      container.dataset.rendered = "false";
      stopRenderLoop();
      handleContextLost(event);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    registerContext(renderer.getContext());
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, getHeroGraphicMaxPixelRatio(isMobile)),
    );

    // Mesh color - adapts to theme
    // Light mode: darker color for visibility, Dark mode: brighter color
    const isDark = document.documentElement.dataset.theme !== "light";
    const meshColorHex = isDark ? 0xffffff : 0x4b5563; // white for dark mode (brighter), gray-600 for light
    const meshColor = new THREE.Color(meshColorHex);

    // Brightness multipliers - higher in dark mode
    const nodeAlphaMultiplier = isDark ? 0.35 : 0.2;
    const lineAlphaMultiplier = isDark ? 0.9 : 0.7; // Increased for better contrast

    // Taper desktop density with width so mid-sized laptop/1080p viewports do not look overcrowded.
    const nodeCount = meshNodeCount;
    const connectionDistance = isMobile ? 6 : 5; // Slightly larger on mobile to maintain connectivity with fewer nodes
    const connectionDistanceSq = connectionDistance * connectionDistance;
    const candidateConnectionDistance = connectionDistance + CONNECTION_SEARCH_PADDING;
    const candidateConnectionDistanceSq = candidateConnectionDistance * candidateConnectionDistance;
    const nodeSize =
      getMeshNodeSize(container.clientWidth, isMobile) *
      meshPointPixelScale(window.devicePixelRatio);

    const nodes: Node[] = Array.from({ length: nodeCount }, () => ({
      position: new THREE.Vector3(),
      basePosition: new THREE.Vector3(),
    }));
    layoutMeshNodes(nodes, container.clientWidth, container.clientHeight, isMobile);

    // Create point geometry for nodes
    const pointsGeometry = new THREE.BufferGeometry();
    const pointPositions = new Float32Array(nodeCount * 3);
    syncPointPositions(pointPositions, nodes);

    const pointPositionAttribute = new THREE.BufferAttribute(pointPositions, 3);
    pointPositionAttribute.setUsage(THREE.DynamicDrawUsage);
    pointsGeometry.setAttribute("position", pointPositionAttribute);
    const pointPosArray = pointPositionAttribute.array as Float32Array;

    // Custom shader for hollow circle nodes with center dot
    const pointsMaterial = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: meshColor },
        size: { value: nodeSize * 100 },
        alphaMultiplier: { value: nodeAlphaMultiplier },
      },
      vertexShader: `
        uniform float size;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float alphaMultiplier;
        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          float edge = fwidth(dist) * 1.5; // Adaptive AA

          // Center dot (filled)
          float dotRadius = 0.12; // Small radius for center dot
          float dotAlpha = 1.0 - smoothstep(dotRadius - edge, dotRadius, dist);

          // Hollow ring
          float outerRadius = 0.5;
          float ringWidth = 0.08; // Thin ring
          float innerRadius = outerRadius - ringWidth;
          float outerAlpha = 1.0 - smoothstep(outerRadius - edge, outerRadius, dist);
          float innerAlpha = smoothstep(innerRadius - edge, innerRadius, dist);
          float ringAlpha = outerAlpha * innerAlpha;

          // Combine dot and ring
          float alpha = max(dotAlpha, ringAlpha);
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(color, alpha * alphaMultiplier);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    scene.add(points);

    let candidatePairs = buildCandidatePairs(nodes, candidateConnectionDistanceSq);

    // Create lines geometry for connections
    const maxConnections = (nodeCount * (nodeCount - 1)) / 2;
    const linePositions = new Float32Array(maxConnections * 6); // 2 points per line, 3 coords each
    const lineAlphas = new Float32Array(maxConnections * 2);

    const linesGeometry = new THREE.BufferGeometry();
    const linePositionAttribute = new THREE.BufferAttribute(linePositions, 3);
    const lineAlphaAttribute = new THREE.BufferAttribute(lineAlphas, 1);
    linePositionAttribute.setUsage(THREE.DynamicDrawUsage);
    lineAlphaAttribute.setUsage(THREE.DynamicDrawUsage);
    linesGeometry.setAttribute("position", linePositionAttribute);
    linesGeometry.setAttribute("alpha", lineAlphaAttribute);
    linesGeometry.setDrawRange(0, 0);

    // Custom shader for fading lines
    const linesMaterial = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: meshColor },
        alphaMultiplier: { value: lineAlphaMultiplier },
      },
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float alphaMultiplier;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(color, vAlpha * alphaMultiplier);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    const lines = new THREE.LineSegments(linesGeometry, linesMaterial);
    scene.add(lines);

    // Animation — only schedule rAF while visible (see planet-graphic).
    let animationId: number | null = null;
    let time = 0;
    let pageVisible = document.visibilityState === "visible";
    const initialBounds = container.getBoundingClientRect();
    let inViewport = initialBounds.bottom > 0 && initialBounds.top < window.innerHeight;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = motionPreference.matches;
    let shouldAnimate = false;
    let lastRenderTime = 0;
    const frameBudgetMs = isMobile ? MOBILE_FRAME_BUDGET_MS : 0;

    const updateConnections = () => {
      let lineIndex = 0;
      const positions = linePositionAttribute.array as Float32Array;
      const alphas = lineAlphaAttribute.array as Float32Array;

      for (let pairIndex = 0; pairIndex < candidatePairs.length; pairIndex += 2) {
        const nodeA = nodes[candidatePairs[pairIndex]];
        const nodeB = nodes[candidatePairs[pairIndex + 1]];
        const dx = nodeA.position.x - nodeB.position.x;
        const dy = nodeA.position.y - nodeB.position.y;
        const dz = nodeA.position.z - nodeB.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq >= connectionDistanceSq) continue;

        const idx = lineIndex * 6;
        const alphaIdx = lineIndex * 2;

        positions[idx] = nodeA.position.x;
        positions[idx + 1] = nodeA.position.y;
        positions[idx + 2] = nodeA.position.z;
        positions[idx + 3] = nodeB.position.x;
        positions[idx + 4] = nodeB.position.y;
        positions[idx + 5] = nodeB.position.z;

        const alpha = 1 - Math.sqrt(distSq) / connectionDistance;
        alphas[alphaIdx] = alpha;
        alphas[alphaIdx + 1] = alpha;

        lineIndex++;
      }

      linesGeometry.setDrawRange(0, lineIndex * 2);

      // The line buffers are sized for every possible pair, but only the first `lineIndex`
      // segments hold live data. Without an update range three re-uploads the whole
      // allocation each frame, which is ~97% padding at desktop node counts.
      linePositionAttribute.clearUpdateRanges();
      lineAlphaAttribute.clearUpdateRanges();
      if (lineIndex > 0) {
        linePositionAttribute.addUpdateRange(0, lineIndex * 6);
        lineAlphaAttribute.addUpdateRange(0, lineIndex * 2);
        linePositionAttribute.needsUpdate = true;
        lineAlphaAttribute.needsUpdate = true;
      }
    };

    const stopRenderLoop = () => {
      if (animationId != null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    };

    const tick = (now: number) => {
      animationId = null;
      if (!shouldAnimate) return;

      if (frameBudgetMs > 0 && now - lastRenderTime < frameBudgetMs) {
        animationId = requestAnimationFrame(tick);
        return;
      }
      lastRenderTime = now;

      if (getViewportResizeKey(container) !== lastResizeKey) {
        handleResize();
      }

      time += 0.005;

      // Update node positions with subtle floating motion
      const positionAttr = pointsGeometry.attributes.position;

      for (let i = 0; i < nodeCount; i++) {
        const node = nodes[i];

        // Gentle floating animation
        const offsetX = Math.sin(time + i * 0.5) * 0.15;
        const offsetY = Math.cos(time * 0.8 + i * 0.3) * 0.15;
        const offsetZ = Math.sin(time * 0.6 + i * 0.7) * 0.1;

        node.position.x = node.basePosition.x + offsetX;
        node.position.y = node.basePosition.y + offsetY;
        node.position.z = node.basePosition.z + offsetZ;

        pointPosArray[i * 3] = node.position.x;
        pointPosArray[i * 3 + 1] = node.position.y;
        pointPosArray[i * 3 + 2] = node.position.z;
      }

      positionAttr.needsUpdate = true;
      updateConnections();

      renderer.render(scene, camera);
      container.dataset.rendered = "true";
      animationId = requestAnimationFrame(tick);
    };

    const startRenderLoop = () => {
      if (animationId != null || !shouldAnimate) return;
      animationId = requestAnimationFrame(tick);
    };

    const renderStillFrame = () => {
      if (!pageVisible || !inViewport || renderer.getContext().isContextLost()) return;
      renderer.render(scene, camera);
      container.dataset.rendered = "true";
    };

    const syncAnimationState = () => {
      shouldAnimate = pageVisible && inViewport && !reducedMotion;
      if (shouldAnimate) startRenderLoop();
      else {
        stopRenderLoop();
        renderStillFrame();
      }
    };

    const handleMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      syncAnimationState();
    };

    const handleVisibilityChange = () => {
      pageVisible = document.visibilityState === "visible";
      syncAnimationState();
    };

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        inViewport = entry?.isIntersecting ?? false;
        syncAnimationState();
      },
      { threshold: 0 },
    );
    intersectionObserver.observe(container);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    motionPreference.addEventListener("change", handleMotionChange);

    let resizeTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastResizeKey = getViewportResizeKey(container);
    const handleResize = () => {
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;

      lastResizeKey = getViewportResizeKey(container);
      const nextIsMobile = getIsMobileLayout(width);
      const nextNodeCount = getMeshNodeCount(width, nextIsMobile);

      if (nextIsMobile !== isMobile || nextNodeCount !== meshNodeCount) {
        setIsMobile((prev) => (prev === nextIsMobile ? prev : nextIsMobile));
        setMeshNodeCount((prev) => (prev === nextNodeCount ? prev : nextNodeCount));
        return;
      }

      const nextNodeSize =
        getMeshNodeSize(width, nextIsMobile) * meshPointPixelScale(window.devicePixelRatio);
      const nextCameraYOffset = nextIsMobile ? 4 : 0;
      camera.aspect = width / height;
      camera.position.set(0, nextCameraYOffset, 30);
      camera.lookAt(0, nextCameraYOffset, 0);
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, getHeroGraphicMaxPixelRatio(nextIsMobile)),
      );
      renderer.setSize(width, height, false);
      pointsMaterial.uniforms.size.value = nextNodeSize * 100;
      layoutMeshNodes(nodes, width, height, nextIsMobile);
      syncPointPositions(pointPosArray, nodes);
      pointsGeometry.attributes.position.needsUpdate = true;
      candidatePairs = buildCandidatePairs(nodes, candidateConnectionDistanceSq);
      updateConnections();
      renderStillFrame();
    };

    const scheduleResize = () => {
      if (resizeTimeoutId) {
        clearTimeout(resizeTimeoutId);
      }
      resizeTimeoutId = setTimeout(handleResize, RESIZE_DEBOUNCE_MS);
    };

    const scheduleResizeIfViewportChanged = () => {
      if (!container) return;
      const nextResizeKey = getViewportResizeKey(container);
      if (nextResizeKey === lastResizeKey) return;
      scheduleResize();
    };

    const resizeObserver = new ResizeObserver(scheduleResize);
    resizeObserver.observe(container);
    window.addEventListener("resize", scheduleResize, { passive: true });
    window.visualViewport?.addEventListener("resize", scheduleResizeIfViewportChanged, {
      passive: true,
    });
    window.visualViewport?.addEventListener("scroll", scheduleResizeIfViewportChanged, {
      passive: true,
    });

    const syncTheme = () => {
      const dark = document.documentElement.dataset.theme !== "light";
      const color = new THREE.Color(dark ? 0xffffff : 0x4b5563);
      pointsMaterial.uniforms.color.value.copy(color);
      pointsMaterial.uniforms.alphaMultiplier.value = dark ? 0.35 : 0.2;
      linesMaterial.uniforms.color.value.copy(color);
      linesMaterial.uniforms.alphaMultiplier.value = dark ? 0.9 : 0.7;
      renderStillFrame();
    };
    const themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // Reduced motion still gets the same mesh, rendered once without a rAF loop.
    updateConnections();
    renderStillFrame();
    syncAnimationState();

    return () => {
      container.dataset.rendered = "false";
      stopRenderLoop();
      themeObserver.disconnect();
      motionPreference.removeEventListener("change", handleMotionChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      intersectionObserver.disconnect();
      if (resizeTimeoutId) {
        clearTimeout(resizeTimeoutId);
      }
      canvas.removeEventListener("webglcontextlost", onContextLost);
      registerContext(null);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleResize);
      window.visualViewport?.removeEventListener("resize", scheduleResizeIfViewportChanged);
      window.visualViewport?.removeEventListener("scroll", scheduleResizeIfViewportChanged);

      pointsGeometry.dispose();
      pointsMaterial.dispose();
      linesGeometry.dispose();
      linesMaterial.dispose();
      renderer.dispose();
    };
  }, [
    contextGeneration,
    hasFailed,
    isMobile,
    meshNodeCount,
    handleContextLost,
    registerContext,
    requestContextRecovery,
  ]);

  return (
    <div ref={containerRef} className="hero-mesh" aria-hidden="true">
      <svg
        className="hero-mesh-fallback"
        viewBox="0 0 1200 600"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <path d="M-30 150 90 105 225 185 345 100 485 150 635 85 755 160 905 100 1050 180 1230 115M-30 150 45 300 180 270 320 340 450 260 600 315 735 280 880 330 1030 275 1190 320 1230 115M45 300 110 470 250 425 370 500 510 430 650 485 805 430 940 480 1080 420 1240 490M90 105 180 270 225 185 320 340 345 100 450 260 485 150 600 315 635 85 735 280 755 160 880 330 905 100 1030 275 1050 180 1190 320M45 300 250 425 180 270 370 500 320 340 510 430 450 260 650 485 600 315 805 430 735 280 940 480 880 330 1080 420 1030 275 1240 490" />
        {[
          [90, 105],
          [225, 185],
          [345, 100],
          [485, 150],
          [635, 85],
          [755, 160],
          [905, 100],
          [1050, 180],
          [45, 300],
          [180, 270],
          [320, 340],
          [450, 260],
          [600, 315],
          [735, 280],
          [880, 330],
          [1030, 275],
          [1190, 320],
          [110, 470],
          [250, 425],
          [370, 500],
          [510, 430],
          [650, 485],
          [805, 430],
          [940, 480],
          [1080, 420],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="3" />
        ))}
      </svg>
      <canvas key={contextGeneration} ref={canvasRef} />
    </div>
  );
}
