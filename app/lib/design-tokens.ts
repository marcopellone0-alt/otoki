// Otoki Design Tokens
// Single source of truth for colors, spacing, and typography.
// When in doubt, reference this file. Don't invent new values.

export const colors = {
  // Backgrounds
  bg: "#0A0A0A",                  // App background (warm near-black)
  surface: "#171717",             // Cards, raised elements
  surfaceElevated: "#262626",     // Modals, hover states, borders
  surfaceHover: "#1F1F1F",        // Card hover state

  // Text
  textPrimary: "#FAFAFA",
  textSecondary: "#A3A3A3",
  textTertiary: "#525252",

  // Accent (Otoki red - slightly magenta-biased)
  accent: "#FF0033",
  accentHover: "#E60029",
  accentPressed: "#CC0029",
  accentGlow: "rgba(255, 0, 51, 0.2)",

  // Borders
  border: "#262626",
  borderStrong: "#404040",
} as const;

export const spacing = {
  // Strict 4px-based scale. Use these ONLY.
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  "2xl": "32px",
  "3xl": "48px",
  "4xl": "64px",
  "5xl": "96px",
} as const;

export const typography = {
  // Display scale
  displayXL: "text-[56px] font-black tracking-[-0.03em] leading-[0.95]",
  displayL: "text-[36px] font-black tracking-[-0.02em] leading-[1.05]",
  displayM: "text-[24px] font-extrabold tracking-[-0.01em] leading-[1.15]",

  // Body scale
  bodyL: "text-[16px] font-medium leading-[1.5]",
  body: "text-[14px] font-normal leading-[1.5]",

  // Caption / metadata
  caption: "text-[12px] font-semibold uppercase tracking-[0.08em]",
  label: "text-[11px] font-semibold uppercase tracking-[0.1em]",
} as const;

export const radius = {
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "20px",
  pill: "9999px",
} as const;

// Helper: format a gig date for the stacked date block on cards.
// Returns { day: "FRI", date: "17", month: "APR", full: "Friday 17 April" }
export const formatGigDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return { day: "TBA", date: "", month: "", full: "Date TBA", isToday: false, isTomorrow: false };

  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isToday = date.getTime() === today.getTime();
  const isTomorrow = date.getTime() === tomorrow.getTime();

  return {
    day: date.toLocaleDateString("en-AU", { weekday: "short" }).toUpperCase(),
    date: date.getDate().toString(),
    month: date.toLocaleDateString("en-AU", { month: "short" }).toUpperCase(),
    full: date.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }),
    isToday,
    isTomorrow,
  };
};

// Helper: group gigs into buckets for the day-grouped listing view.
// Returns: { today: [...], tomorrow: [...], upcoming: { "FRI 17 APR": [...] } }
export const groupGigsByDay = (gigs: any[]) => {
  const today: any[] = [];
  const tomorrow: any[] = [];
  const upcoming: Record<string, any[]> = {};

  for (const gig of gigs) {
    const dateStr = gig.dates?.start?.localDate;
    if (!dateStr) {
      const key = "DATE TBA";
      if (!upcoming[key]) upcoming[key] = [];
      upcoming[key].push(gig);
      continue;
    }

    const formatted = formatGigDate(dateStr);
    if (formatted.isToday) {
      today.push(gig);
    } else if (formatted.isTomorrow) {
      tomorrow.push(gig);
    } else {
      const key = `${formatted.day} ${formatted.date} ${formatted.month}`;
      if (!upcoming[key]) upcoming[key] = [];
      upcoming[key].push(gig);
    }
  }

  return { today, tomorrow, upcoming };
};
