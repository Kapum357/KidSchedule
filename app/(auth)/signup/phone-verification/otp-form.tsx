"use client";

import { useRef, useState, useEffect, useTransition } from "react";

interface OtpFormProps {
  readonly phone: string;
  readonly action: (formData: FormData) => Promise<void>;
}

export function OtpForm({ action }: OtpFormProps) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [countdown, setCountdown] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    setCanResend(countdown <= 0);
  }, [countdown]);

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = [...digits];
    pasted.split("").forEach((ch, i) => { next[i] = ch; });
    setDigits(next);
    const focusIndex = Math.min(pasted.length, 5);
    inputRefs.current[focusIndex]?.focus();
  };

  const handleResend = () => {
    setCountdown(30);
    setCanResend(false);
    setDigits(Array(6).fill(""));
    inputRefs.current[0]?.focus();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("otp", digits.join(""));
    startTransition(() => action(formData));
  };

  const inputCls =
    "w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-semibold bg-background-light dark:bg-slate-800 border-2 border-[#eaf1f0] dark:border-slate-700 rounded text-slate-900 dark:text-white focus:border-primary focus:ring-0 focus:outline-none transition-all";

  return (
    <form className="flex flex-col gap-8" onSubmit={handleSubmit}>
      {/* Hidden combined OTP field (read by server action) */}
      <input name="otp" type="hidden" value={digits.join("")} readOnly />

      {/* 6 digit inputs */}
      <div className="flex gap-2 sm:gap-4 justify-between" onPaste={handlePaste}>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            aria-label={`Digit ${i + 1} of 6`}
            autoFocus={i === 0}
            className={inputCls}
            inputMode="numeric"
            maxLength={1}
            pattern="\d"
            placeholder="0"
            type="text"
            value={digit}
            onChange={(e) => handleDigitChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
          />
        ))}
      </div>

      {/* Resend */}
      <div className="text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Didn&apos;t receive the code?{" "}
          <button
            className="text-primary font-bold hover:text-primary-dark transition-colors ml-1 disabled:opacity-40"
            disabled={!canResend}
            onClick={handleResend}
            type="button"
          >
            Resend Code
          </button>
          {!canResend && (
            <span className="ml-1 text-xs opacity-60 font-mono tabular-nums">
              (00:{String(countdown).padStart(2, "0")})
            </span>
          )}
        </p>
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-4 pt-2">
        <button
          className="w-full h-12 bg-primary hover:bg-primary-dark text-white font-bold rounded shadow-sm transition-all active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-60"
          disabled={isPending || digits.join("").length < 6}
          type="submit"
        >
          <span>{isPending ? "Verifying…" : "Verify & Continue"}</span>
          <span aria-hidden="true" className="material-symbols-outlined text-sm font-bold">
            arrow_forward
          </span>
        </button>
        <a
          className="w-full h-12 bg-transparent border border-[#eaf1f0] dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold rounded transition-colors text-sm flex items-center justify-center"
          href="/signup"
        >
          Back to previous step
        </a>
      </div>
    </form>
  );
}
