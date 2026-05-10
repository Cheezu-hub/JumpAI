/** @type {import('tailwindcss').Config} */
module.exports = {
  mode: "jit",
  darkMode: "class",
  content: ["./**/*.tsx"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "rgba(12, 12, 14, 0.97)",
          raised: "rgba(20, 20, 24, 0.95)",
          border: "rgba(255, 255, 255, 0.07)",
          hover: "rgba(255, 255, 255, 0.05)"
        },
        accent: {
          primary: "#cc785c",
          muted: "rgba(204, 120, 92, 0.15)",
          glow: "rgba(204, 120, 92, 0.25)"
        },
        text: {
          primary: "rgba(255, 255, 255, 0.92)",
          secondary: "rgba(255, 255, 255, 0.50)",
          tertiary: "rgba(255, 255, 255, 0.28)"
        }
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "sans-serif"
        ]
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
        "3xl": "24px"
      },
      boxShadow: {
        panel: "0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
        btn: "0 2px 12px rgba(0,0,0,0.4)",
        "accent-glow": "0 0 20px rgba(204, 120, 92, 0.3)"
      },
      animation: {
        "fade-in": "fadeIn 0.18s ease-out",
        "slide-up": "slideUp 0.22s cubic-bezier(0.16,1,0.3,1)",
        "scale-in": "scaleIn 0.15s cubic-bezier(0.16,1,0.3,1)",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite"
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" }
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" }
        },
        scaleIn: {
          from: { opacity: "0", transform: "scale(0.94)" },
          to: { opacity: "1", transform: "scale(1)" }
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" }
        }
      },
      backdropBlur: {
        xs: "4px",
        sm: "8px",
        md: "16px"
      }
    }
  },
  plugins: []
}
