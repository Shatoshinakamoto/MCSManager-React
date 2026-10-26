/**
 * First-visit guided tour of the market page (port of widgets/market/useMarketTour.ts).
 *
 * The "done" flag lives in localStorage; reads and writes are wrapped because
 * storage can be blocked (private mode), and only the exact value "1" counts.
 */
import type { TourProps } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lang/i18n";

const MCS_MARKET_TOUR_DONE = "mcs_market_tour_completed";

const tourDone = () => {
  try {
    return localStorage.getItem(MCS_MARKET_TOUR_DONE) === "1";
  } catch {
    return true;
  }
};

export function useMarketTour(isAdmin: boolean) {
  const step1Ref = useRef<HTMLDivElement | null>(null);
  const step2Ref = useRef<HTMLDivElement | null>(null);
  const step3Ref = useRef<HTMLDivElement | null>(null);
  const [openTour, setOpenTour] = useState(false);
  const [tourCurrent, setTourCurrent] = useState(0);

  const setStepRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (index === 0) step1Ref.current = el;
    if (index === 1) step2Ref.current = el;
  }, []);

  const tourSteps = useMemo<TourProps["steps"]>(() => {
    const steps: NonNullable<TourProps["steps"]> = [];
    if (isAdmin) {
      steps.push({ target: () => step1Ref.current!, title: t("TXT_CODE_1bfd647d"), description: t("TXT_CODE_b5be5a6a") });
      steps.push({ target: () => step2Ref.current!, title: t("TXT_CODE_963e00f"), description: t("TXT_CODE_572ba7f0") });
    }
    steps.push({ target: () => step3Ref.current!, title: t("TXT_CODE_d284d8a9"), description: t("TXT_CODE_22814776") });
    return steps;
  }, [isAdmin]);

  const markTourDone = useCallback(() => {
    try {
      localStorage.setItem(MCS_MARKET_TOUR_DONE, "1");
    } catch {
      /* storage blocked: the tour simply shows again next visit */
    }
    setOpenTour(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.innerWidth < 1000 || tourDone()) return;
      setOpenTour(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return { step3Ref, openTour, tourCurrent, setTourCurrent, tourSteps, setStepRef, markTourDone };
}
