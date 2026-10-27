"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Icon, Star } from "./icons";
import { GalaxyStarfield } from "./galaxy-starfield";
import styles from "./galaxy-hero.module.css";

const slides = [
  {
    image: "/images/hero-galaxy-midnight.png",
    title: ["جهانی از مراقبت،", "درخششی از تو"],
    description: [
      "از مراقبت روزانه تا محصولات تخصصی پوست و مو؛",
      "انتخابی آگاهانه از برندهای معتبر، برای درخشش منحصربه‌فرد تو.",
    ],
    primary: "کشف محصولات",
    secondary: "با سون اسپارکلز آشنا شو",
    secondaryHref: "#about",
    label: "دنیای مراقبت سون اسپارکلز",
  },
  {
    image: "/images/hero-galaxy-aurora.png",
    title: ["مراقبت از ریشه،", "درخششی هر روز"],
    description: [
      "دنیای محصولات نووسلیکس را کشف کن؛",
      "انتخاب‌هایی برای کامل‌تر شدن روتین مراقبت از پوست و موی تو.",
    ],
    primary: "کشف محصولات",
    secondary: "دنیای برندهای ما",
    secondaryHref: "#brands",
    label: "دنیای مراقبت نووسلیکس",
  },
  {
    image: "/images/hero-galaxy-violet.png",
    title: ["از یک انتخاب تازه،", "تا درخشش هر روز"],
    description: [
      "با مجموعه محصولات دکتر ژنو آشنا شو؛",
      "یک قدم تازه در مسیر روتینی که برای خودت انتخاب می‌کنی.",
    ],
    primary: "کشف محصولات",
    secondary: "دنیای برندهای ما",
    secondaryHref: "#brands",
    label: "دنیای مراقبت دکتر ژنو",
  },
] as const;

type Gesture = {
  pointerId: number;
  x: number;
  y: number;
  direction: "pending" | "horizontal" | "vertical";
};

const interactiveSelector = "a, button, input, select, textarea, [role='button']";
const faNumber = new Intl.NumberFormat("fa-IR");

export function GalaxyHero() {
  const [activeIndex, setActiveIndex] = useState(0);
  const heroRef = useRef<HTMLElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const frameRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 0, y: 0, glowX: 50, glowY: 50 });
  const reducedMotionRef = useRef(false);
  const suppressClickUntil = useRef(0);
  const slide = slides[activeIndex];

  function resetMotion() {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const hero = heroRef.current;
    if (!hero) return;
    hero.dataset.hovered = "false";
    hero.style.setProperty("--pointer-x", "0px");
    hero.style.setProperty("--pointer-y", "0px");
    hero.style.setProperty("--glow-x", "50%");
    hero.style.setProperty("--glow-y", "50%");
  }

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      reducedMotionRef.current = media.matches;
      if (media.matches) resetMotion();
    };
    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => {
      media.removeEventListener("change", updatePreference);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  function changeSlide(step: number) {
    setActiveIndex((current) => (current + step + slides.length) % slides.length);
  }

  function moveGlow(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "mouse" || reducedMotionRef.current) return;
    const hero = heroRef.current;
    if (!hero) return;
    const bounds = hero.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    pointerRef.current = { x: (x - 0.5) * 16, y: (y - 0.5) * 12, glowX: x * 100, glowY: y * 100 };
    hero.dataset.hovered = "true";
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const pointer = pointerRef.current;
      hero.style.setProperty("--pointer-x", `${pointer.x}px`);
      hero.style.setProperty("--pointer-y", `${pointer.y}px`);
      hero.style.setProperty("--glow-x", `${pointer.glowX}%`);
      hero.style.setProperty("--glow-y", `${pointer.glowY}%`);
    });
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    if ((event.target as Element).closest(interactiveSelector)) return;
    suppressClickUntil.current = 0;
    gestureRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      direction: "pending",
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    moveGlow(event);
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = Math.abs(event.clientX - gesture.x);
    const dy = Math.abs(event.clientY - gesture.y);
    if (gesture.direction === "pending") {
      if (dy > 12 && dy > dx) gesture.direction = "vertical";
      else if (dx > 12 && dx > dy * 1.2) {
        gesture.direction = "horizontal";
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.dataset.dragging = "true";
      }
    }
    if (gesture.direction === "horizontal" && event.cancelable) event.preventDefault();
  }

  function finishGesture(event: PointerEvent<HTMLElement>, cancelled = false) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    event.currentTarget.dataset.dragging = "false";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (gesture.direction === "horizontal") {
      suppressClickUntil.current = performance.now() + 400;
      const dx = event.clientX - gesture.x;
      const threshold = Math.max(44, Math.min(72, event.currentTarget.clientWidth * 0.16));
      if (!cancelled && Math.abs(dx) >= threshold) changeSlide(dx > 0 ? 1 : -1);
    }
    if (event.pointerType !== "mouse") resetMotion();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowLeft") changeSlide(1);
    else if (event.key === "ArrowRight") changeSlide(-1);
    else if (event.key === "Home") setActiveIndex(0);
    else if (event.key === "End") setActiveIndex(slides.length - 1);
    else return;
    event.preventDefault();
  }

  return (
    <section
      ref={heroRef}
      className={styles.hero}
      role="region"
      aria-roledescription="نمایش اسلاید"
      aria-label="محصولات منتخب سون اسپارکلز"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerEnter={moveGlow}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={(event) => finishGesture(event)}
      onPointerCancel={(event) => finishGesture(event, true)}
      onLostPointerCapture={(event) => finishGesture(event, true)}
      onPointerLeave={() => {
        resetMotion();
        if (gestureRef.current?.direction !== "horizontal") gestureRef.current = null;
      }}
      onClickCapture={(event) => {
        if (performance.now() < suppressClickUntil.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className={styles.media} aria-hidden="true">
        {slides.map((item, index) => (
          <div key={item.image} className={`${styles.slide} ${index === activeIndex ? styles.activeSlide : ""}`}>
            <Image
              src={item.image}
              alt=""
              fill
              sizes="(max-width: 360px) 760px, (max-width: 600px) 860px, (max-width: 1640px) calc(100vw - 40px), 1600px"
              loading={index === 0 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : "auto"}
              className={styles.image}
              draggable={false}
            />
          </div>
        ))}
      </div>
      <div className={styles.glow} aria-hidden="true" />
      <GalaxyStarfield hostRef={heroRef} />
      <div className={styles.content}>
        <h1 id="hero-title" className={styles.title}>
          {slide.title[0]}<br />{slide.title[1]} <Star className={styles.titleStar} />
        </h1>
        <p className={styles.description}>{slide.description[0]}<br />{slide.description[1]}</p>
        <div className={styles.actions}>
          <a className={styles.primaryAction} href="#products">{slide.primary} <Icon name="arrow" size={23} /></a>
          <a className={styles.secondaryAction} href={slide.secondaryHref}>{slide.secondary} <Icon name="arrow" size={20} /></a>
        </div>
      </div>
      <div className={styles.footer}>
        <div className={styles.caption} dir="ltr"><span />YOUR EVERYDAY, A LITTLE MORE MAGICAL</div>
        <div className={styles.controls} dir="ltr" aria-label="کنترل اسلایدها">
          <button className={styles.arrowButton} type="button" aria-label="اسلاید بعدی" onClick={() => changeSlide(1)}><Icon name="arrow" size={21} /></button>
          <div className={styles.dots} dir="rtl">
            {slides.map((item, index) => (
              <button
                key={item.image}
                className={`${styles.dot} ${index === activeIndex ? styles.activeDot : ""}`}
                type="button"
                aria-label={`اسلاید ${faNumber.format(index + 1)}: ${item.label}`}
                aria-current={index === activeIndex ? "true" : undefined}
                onClick={() => setActiveIndex(index)}
              />
            ))}
          </div>
          <button className={styles.arrowButton} type="button" aria-label="اسلاید قبلی" onClick={() => changeSlide(-1)}><Icon name="arrow" className={styles.nextArrow} size={21} /></button>
        </div>
      </div>
      <span className={styles.liveStatus} role="status" aria-live="polite" aria-atomic="true">
        اسلاید {faNumber.format(activeIndex + 1)} از {faNumber.format(slides.length)}؛ {slide.label}
      </span>
    </section>
  );
}
