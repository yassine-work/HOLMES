import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./providers/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        holmes: {
          navy: "#11141A",
          deep: "#1D232C",
          steel: "#3C4654",
          mist: "#202732",
          slate: "#8A93A0",
        },
        verdict: {
          verified: "#45D65F",
          suspicious: "#FF4A4A",
          inconclusive: "#7DE2E2",
        },
      },
      fontFamily: {
        heading: ["var(--font-heading)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      boxShadow: {
        panel: "8px 8px 0 rgba(0, 0, 0, 0.45)",
        glass: "4px 4px 0 rgba(0, 0, 0, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
