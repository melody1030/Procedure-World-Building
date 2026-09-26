/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#070b12", // behind the stage
        stage: "#0a0f17", // stage and 3D scene background
      },
      fontFamily: {
        sans: ["Roboto", "-apple-system", '"Segoe UI"', "system-ui", "sans-serif"],
        // Share Tech only ships a regular weight; pair with font-bold for the synthesized bold.
        display: ['"Share Tech"', "-apple-system", '"Segoe UI"', "system-ui", "sans-serif"],
      },
      // Tailwind's default corner radii, all 10% smaller. `full` and `none` are untouched.
      borderRadius: {
        sm: "0.1125rem",
        DEFAULT: "0.225rem",
        md: "0.3375rem",
        lg: "0.45rem",
        xl: "0.675rem",
        "2xl": "0.9rem",
        "3xl": "1.35rem",
      },
    },
  },
  plugins: [],
};
