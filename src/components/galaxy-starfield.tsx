"use client";

import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import styles from "./galaxy-starfield.module.css";

// A fixed seed keeps the server and browser render identical.
const stars = Array.from({ length: 96 }, (_, index) => ({
  x: 3 + ((index * 61.80339887) % 94),
  y: 4 + ((index * 37.327 + 11) % 90),
  size: 2.5 + (index % 5) * 0.6,
  phase: index * 2.39996,
  speed: 0.42 + (index % 7) * 0.07,
  lag: 0.28 + (index % 5) * 0.08,
  opacity: 0.68 + (index % 4) * 0.1,
}));

export function GalaxyStarfield({ hostRef }: { hostRef: RefObject<HTMLElement | null> }) {
  const fieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const field = fieldRef.current;
    if (!host || !field) return;

    const nodes = Array.from(field.children) as HTMLSpanElement[];
    const particles = stars.map(() => ({ x: 0, y: 0, active: false }));
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let bounds = host.getBoundingClientRect();
    let pointer: { x: number; y: number } | null = null;
    let visible = false;
    let frame: number | null = null;
    let previousTime = 0;
    let elapsed = 0;

    function stop() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      previousTime = 0;
    }

    function reset() {
      pointer = null;
      particles.forEach((particle, index) => {
        particle.x = particle.y = 0;
        particle.active = false;
        nodes[index].style.removeProperty("transform");
        nodes[index].dataset.active = "false";
      });
    }

    function animate(now: number) {
      frame = null;
      const step = previousTime ? Math.min((now - previousTime) / 16.667, 2) : 1;
      previousTime = now;
      elapsed += step / 60;
      const radius = bounds.width < 600 ? 85 : 125;
      const drift = bounds.width < 600 ? 16 : 22;

      stars.forEach((star, index) => {
        const particle = particles[index];
        const driftX = Math.sin(elapsed * star.speed + star.phase) * drift;
        const driftY = Math.cos(elapsed * star.speed * 0.8 + star.phase) * drift * 0.8;
        let pushX = 0;
        let pushY = 0;
        let active = false;

        if (pointer) {
          const dx = bounds.width * star.x / 100 + driftX - pointer.x;
          const dy = bounds.height * star.y / 100 + driftY - pointer.y;
          const distance = Math.hypot(dx, dy);
          active = distance < radius;
          if (active) {
            const force = Math.pow(1 - distance / radius, 2) * 82;
            // Give a dot directly under the cursor a stable escape direction.
            pushX = (distance > 0.1 ? dx / distance : Math.cos(star.phase)) * force;
            pushY = (distance > 0.1 ? dy / distance : Math.sin(star.phase)) * force;
          }
        }

        // Each dot trails its target slightly, then takes longer to settle back.
        // Exponential easing stays smooth across frame rates without spring bounce.
        const response = 1 - Math.exp(-step / (60 * star.lag * (active ? 1 : 1.5)));
        particle.x += (pushX - particle.x) * response;
        particle.y += (pushY - particle.y) * response;
        nodes[index].style.transform = `translate3d(${(driftX + particle.x).toFixed(2)}px, ${(driftY + particle.y).toFixed(2)}px, 0)`;
        if (active !== particle.active) {
          nodes[index].dataset.active = String(active);
          particle.active = active;
        }
      });

      frame = requestAnimationFrame(animate);
    }

    function syncAnimation() {
      if (preference.matches || document.hidden || !visible) {
        stop();
        pointer = null;
        if (preference.matches) reset();
      } else if (frame === null) {
        frame = requestAnimationFrame(animate);
      }
    }

    function movePointer(event: PointerEvent) {
      if (preference.matches || !event.isPrimary || event.pointerType === "touch") return;
      bounds = host!.getBoundingClientRect();
      pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    }

    function clearPointer() { pointer = null; }
    function measure() { bounds = host!.getBoundingClientRect(); }

    const resize = new ResizeObserver(measure);
    resize.observe(host);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncAnimation();
    }, { threshold: 0 });
    intersection.observe(host);
    host.addEventListener("pointermove", movePointer, { passive: true });
    host.addEventListener("pointerenter", movePointer, { passive: true });
    host.addEventListener("pointerleave", clearPointer);
    host.addEventListener("pointercancel", clearPointer);
    // Scroll changes the pointer's position relative to the banner without a pointermove.
    window.addEventListener("scroll", clearPointer, { passive: true });
    document.addEventListener("visibilitychange", syncAnimation);
    preference.addEventListener("change", syncAnimation);
    syncAnimation();

    return () => {
      stop();
      resize.disconnect();
      intersection.disconnect();
      host.removeEventListener("pointermove", movePointer);
      host.removeEventListener("pointerenter", movePointer);
      host.removeEventListener("pointerleave", clearPointer);
      host.removeEventListener("pointercancel", clearPointer);
      window.removeEventListener("scroll", clearPointer);
      document.removeEventListener("visibilitychange", syncAnimation);
      preference.removeEventListener("change", syncAnimation);
    };
  }, [hostRef]);

  return (
    <div ref={fieldRef} className={styles.field} aria-hidden="true">
      {stars.map((star, index) => (
        <span
          key={index}
          className={styles.particle}
          data-active="false"
          style={{ left: `${star.x}%`, top: `${star.y}%`, "--size": `${star.size}px`, "--opacity": star.opacity } as CSSProperties}
        ><i /></span>
      ))}
    </div>
  );
}
