import { useEffect, useState } from "react";
import { Joyride, type EventData, type Step, STATUS } from "react-joyride";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const STEPS: Step[] = [
  {
    target: '[data-tour="dashboard-stats"]',
    title: "Your command centre",
    content: "Queries, AI reports, wallet balance and referrals — all at a glance.",
    placement: "bottom",
  },
  {
    target: '[data-tour="post-query"]',
    title: "Post a query",
    content: "Ask any stock question. You'll get a structured AI report in seconds and an expert video within 24h.",
    placement: "bottom",
  },
  {
    target: '[data-tour="wallet"]',
    title: "250 free credits",
    content: "We've credited 250 points to your wallet (valid for 30 days) — enough for ~5 AI reports. Use them to research stocks, get sector views, or ask SEBI-registered analysts.",
    placement: "bottom",
  },
  {
    target: '[data-tour="recent-queries"]',
    title: "Read your AI reports",
    content: "Tap any query to see verdict, risk score, key points and SEBI disclaimers.",
    placement: "top",
  },
];

export function OnboardingTour() {
  const { user, profile, refresh } = useAuth();
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const completed = (profile as unknown as { onboarding_completed?: boolean }).onboarding_completed;
    if (completed === false) {
      const t = setTimeout(() => setRun(true), 600);
      return () => clearTimeout(t);
    }
  }, [profile]);

  const finish = async () => {
    setRun(false);
    if (!user) return;
    await supabase.from("profiles").update({ onboarding_completed: true } as never).eq("id", user.id);
    refresh();
  };

  const handleEvent = (data: EventData) => {
    const done: string[] = [STATUS.FINISHED, STATUS.SKIPPED];
    if (done.includes(data.status)) finish();
  };

  if (!run) return null;
  return (
    <Joyride
      steps={STEPS}
      run={run}
      continuous
      onEvent={handleEvent}
      options={{
        primaryColor: "hsl(176 58% 41%)",
        textColor: "hsl(220 56% 14%)",
        backgroundColor: "#ffffff",
        arrowColor: "#ffffff",
        zIndex: 10000,
        showProgress: true,
        buttons: ["back", "skip", "primary"],
      }}
      styles={{
        tooltip: { borderRadius: 16, padding: 20, fontFamily: "DM Sans, sans-serif" },
        tooltipTitle: { fontFamily: "DM Serif Display, serif", fontSize: 20 },
        buttonPrimary: { borderRadius: 999, padding: "8px 18px", fontWeight: 600 },
        buttonBack: { color: "hsl(220 12% 52%)" },
        buttonSkip: { color: "hsl(220 12% 52%)" },
      }}
      locale={{ skip: "Skip tour", last: "Got it", next: "Next", back: "Back" }}
    />
  );
}

export default OnboardingTour;
