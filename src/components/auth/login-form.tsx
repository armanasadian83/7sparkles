"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { Icon, Star } from "@/components/icons";
import { isIranianMobile, normalizeDigits, normalizePhone } from "@/lib/demo-auth";
import { acceptCustomerSession, customerRequest, logoutCustomer, useCustomerSession } from "@/lib/customer-store";
import type { CustomerCodeResponse, CustomerSession } from "@/lib/customer-types";
import styles from "./login.module.css";

const EMPTY_CODE = ["", "", "", "", "", ""];
const digitLabels = ["اول", "دوم", "سوم", "چهارم", "پنجم", "ششم"];
const formatNumber = (value: number) => value.toLocaleString("fa-IR");

export function LoginForm() {
  const auth = useCustomerSession();
  const session = auth.customer;
  const router = useRouter();
  const params = useSearchParams();
  const target = params.get("next");
  const next = target && ["/myorders", "/checkout", "/cart", "/shop", "/"].includes(target) ? target : "/myorders";
  const [step, setStep] = useState<"phone" | "code" | "success">("phone");
  const [phone, setPhone] = useState("");
  const [challenge, setChallenge] = useState<CustomerCodeResponse | null>(null);
  const [digits, setDigits] = useState(EMPTY_CODE);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const phoneInput = useRef<HTMLInputElement>(null);
  const codeInputs = useRef<Array<HTMLInputElement | null>>([]);
  const successHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (step !== "code") return;
    codeInputs.current[0]?.focus();
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [step]);

  useEffect(() => {
    if (step === "success") successHeading.current?.focus();
  }, [step]);

  const expiresIn = challenge ? Math.max(0, Math.ceil((challenge.expiresAt - now) / 1_000)) : 0;
  const resendIn = challenge ? Math.max(0, Math.ceil((challenge.resendAt - now) / 1_000)) : 0;
  const success = session !== null && !auth.loading;
  const phoneStep = step !== "code";
  const displayPhone = session?.phone ?? normalizePhone(phone);

  async function post<T>(path: string, body: unknown) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try { return await customerRequest<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal }); }
    finally { window.clearTimeout(timeout); }
  }

  async function requestCode(normalized: string) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      const result = await post<CustomerCodeResponse>("/api/customer/auth/request", { phone: normalized });
      if (typeof result.challengeId !== "string" || !Number.isFinite(result.expiresAt) || !Number.isFinite(result.resendAt)) throw new Error("پاسخ سرویس ورود معتبر نیست.");
      setPhone(normalized);
      setChallenge(result);
      setNow(Date.now());
      setDigits([...EMPTY_CODE]);
      setStep("code");
    } catch (cause) { setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "ارتباط با سرویس ورود برقرار نشد. دوباره تلاش کنید."); }
    finally { pendingRef.current = false; setPending(false); }
  }

  function beginChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizePhone(phone).replace(/^\+98/, "0");
    if (!isIranianMobile(normalized)) {
      setError("شماره موبایل را با ۰۹ و در ۱۱ رقم وارد کن.");
      phoneInput.current?.focus();
      return;
    }
    void requestCode(normalized);
  }

  function resendCode() {
    if (!challenge || Date.now() < challenge.resendAt) return;
    void requestCode(phone);
  }

  async function changePhone() {
    if (pendingRef.current) return;
    if (session) {
      pendingRef.current = true;
      setPending(true);
      try { await logoutCustomer(); }
      catch { setError("خروج انجام نشد. دوباره تلاش کنید."); return; }
      finally { pendingRef.current = false; setPending(false); }
    }
    setChallenge(null);
    setDigits([...EMPTY_CODE]);
    setError("");
    setStep("phone");
    window.requestAnimationFrame(() => phoneInput.current?.focus());
  }

  function fillDigits(value: string, start: number) {
    const normalized = normalizeDigits(value).replace(/\D/g, "");
    if (!normalized) {
      setDigits((current) => current.map((digit, index) => index === start ? "" : digit));
      setError("");
      return;
    }
    // OTP autofill and full-code paste may arrive in any focused slot.
    const offset = normalized.length >= 6 ? 0 : start;
    const incoming = normalized.slice(0, 6 - offset).split("");
    setDigits((current) => {
      const next = [...current];
      incoming.forEach((digit, index) => { next[offset + index] = digit; });
      return next;
    });
    setError("");
    const nextIndex = Math.min(offset + incoming.length, 5);
    codeInputs.current[nextIndex]?.focus();
    codeInputs.current[nextIndex]?.select();
  }

  function pasteCode(event: ClipboardEvent<HTMLInputElement>, index: number) {
    event.preventDefault();
    fillDigits(event.clipboardData.getData("text"), index);
  }

  function handleCodeKey(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      setDigits((current) => current.map((digit, position) => position === index - 1 ? "" : digit));
      codeInputs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      codeInputs.current[index - 1]?.focus();
      codeInputs.current[index - 1]?.select();
    } else if (event.key === "ArrowRight" && index < 5) {
      event.preventDefault();
      codeInputs.current[index + 1]?.focus();
      codeInputs.current[index + 1]?.select();
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge || pendingRef.current) return;
    if (Date.now() >= challenge.expiresAt) {
      setNow(Date.now());
      setError("اعتبار این کد تمام شده. یک کد جدید دریافت کن.");
      return;
    }
    if (digits.some((digit) => digit === "")) {
      setError("هر ۶ رقم کد ورود را وارد کن.");
      codeInputs.current[digits.findIndex((digit) => digit === "")]?.focus();
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      const result = await post<{ customer: CustomerSession }>("/api/customer/auth/verify", { challengeId: challenge.challengeId, code: digits.join("") });
      if (!result.customer?.id || !result.customer.phone || !result.customer.signedInAt) throw new Error("پاسخ حساب معتبر نیست.");
      acceptCustomerSession(result.customer);
      setChallenge(null);
      setDigits([...EMPTY_CODE]);
      setStep("success");
      router.replace(next);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "تأیید ورود انجام نشد. دوباره تلاش کنید.");
      codeInputs.current[0]?.focus();
      codeInputs.current[0]?.select();
    } finally { pendingRef.current = false; setPending(false); }
  }

  if (success) {
    return (
      <div className={styles.success}>
        <span className={styles.successIcon}><Icon name="check" size={31} /></span>
        <h1 ref={successHeading} tabIndex={-1}>خوش آمدی، همراه درخشان ما</h1>
        <p className={styles.intro}>با شماره <bdi dir="ltr">{displayPhone}</bdi> وارد حساب خود شده‌اید.</p>
        <Link href={next} className={styles.primary}>{next === "/myorders" ? "مشاهده سفارشات من" : "ادامه"}<Icon name="arrow" size={21} /></Link>
        <button type="button" className={styles.changeAccount} disabled={pending} onClick={() => void changePhone()}>خروج و ورود با شماره دیگر</button>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <h1 className={styles.heading}>{phoneStep ? "به سون اسپارکلز خوش آمدی" : "کد ورود را وارد کن"}</h1>
      <p className={styles.intro}>
        {phoneStep ? "برای ورود، شماره موبایل خود را وارد کن." : <>کد ۶ رقمی مربوط به شماره <bdi dir="ltr">{phone}</bdi> را وارد کن.</>}
      </p>
      {phoneStep ? (
        <form className={styles.form} onSubmit={beginChallenge} noValidate>
          <label htmlFor="login-phone" className={styles.label}>شماره موبایل</label>
          <input
            ref={phoneInput}
            id="login-phone"
            name="phone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="09123456789"
            value={phone}
            maxLength={18}
            disabled={pending || !auth.loaded}
            onChange={(event) => { setPhone(normalizeDigits(event.target.value)); setError(""); }}
            className={styles.phoneInput}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "phone-error" : "login-demo-note"}
          />
          {error && <p id="phone-error" className={styles.error} role="alert">{error}</p>}
          <button type="submit" className={styles.primary} disabled={pending || !auth.loaded}>{pending ? "در حال دریافت کد…" : "دریافت کد ورود"}<Icon name="arrow" size={21} /></button>
          <div className={styles.divider}><span /><Star /><span /></div>
          <p className={styles.otpCaption}>ورود با کد یک‌بارمصرف</p>
          <p id="login-demo-note" className={styles.localNote}>برای دیدن سفارش‌ها، ورود به حساب باید در سرور تأیید شود.</p>
        </form>
      ) : (
        <form className={styles.form} onSubmit={verifyCode} noValidate>
          <fieldset className={styles.otpFieldset} disabled={pending} aria-describedby={error ? "otp-error" : "otp-timer"}>
            <legend className={styles.label}>کد ورود ۶ رقمی</legend>
            <div className={styles.codeInputs} dir="ltr">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => { codeInputs.current[index] = element; }}
                  aria-label={`رقم ${digitLabels[index]} کد ورود`}
                  aria-invalid={Boolean(error)}
                  name={`otp-${index}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  maxLength={6}
                  value={digit}
                  onFocus={(event) => event.target.select()}
                  onChange={(event) => fillDigits(event.target.value, index)}
                  onPaste={(event) => pasteCode(event, index)}
                  onKeyDown={(event) => handleCodeKey(event, index)}
                />
              ))}
            </div>
          </fieldset>
          {error && <p id="otp-error" className={styles.error} role="alert">{error}</p>}
          <p id="otp-timer" className={`${styles.timer} ${expiresIn === 0 ? styles.expired : ""}`}>
            {expiresIn > 0 ? <>اعتبار کد: {formatNumber(Math.floor(expiresIn / 60))}:{formatNumber(expiresIn % 60).padStart(2, "۰")}</> : "اعتبار کد تمام شده است."}
          </p>
          <button type="submit" className={styles.primary} disabled={expiresIn === 0 || pending}>{pending ? "در حال تأیید…" : "تأیید و ورود"}<Icon name="arrow" size={21} /></button>
          {challenge?.developmentCode ? <div className={styles.demoCode} role="status">
            <div><Star /><span>کد آزمایشی:</span><strong dir="ltr">{challenge.developmentCode}</strong></div>
            <p>این کد فقط در محیط توسعه نمایش داده می‌شود؛ پیامکی ارسال نشده.</p>
          </div> : null}
          <div className={styles.codeActions}>
            <button type="button" onClick={resendCode} disabled={resendIn > 0 || pending}>
              {resendIn > 0 ? `دریافت دوباره کد (${formatNumber(resendIn)} ثانیه)` : "دریافت دوباره کد"}
            </button>
            <button type="button" disabled={pending} onClick={() => void changePhone()}>تغییر شماره موبایل</button>
          </div>
        </form>
      )}
    </div>
  );
}
