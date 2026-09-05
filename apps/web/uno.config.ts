import { defineConfig, presetUno } from 'unocss'

export default defineConfig({
  presets: [presetUno()],
  theme: {
    breakpoints: {
      mobile: '0px',
      tablet: '768px',
      desktop: '1200px',
    },
  },
})
