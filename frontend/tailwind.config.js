/** Define a warm paper, forest-accent editorial theme. */
const neutral = { 50:'oklch(0.985 0.003 85)',100:'oklch(0.955 0.004 85)',200:'oklch(0.89 0.005 85)',300:'oklch(0.81 0.006 85)',400:'oklch(0.70 0.006 85)',500:'oklch(0.58 0.006 85)',600:'oklch(0.47 0.006 85)',700:'oklch(0.36 0.006 85)',800:'oklch(0.26 0.006 85)',900:'oklch(0.19 0.006 85)',950:'oklch(0.13 0.006 85)' };
const primary = {50:'#edf3ec',100:'#dce9dc',200:'#b8d1bc',300:'#91b89a',400:'#6b9d78',500:'#48825e',600:'#306747',700:'#255239',800:'#1c422e',900:'#153324',950:'#0d2218'};
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {
    colors: { neutral, primary, secondary: neutral, background:'#faf9f6',surface:'#ffffff','surface-raised':'#f3f2ee',foreground:'#252720','foreground-muted':'#60635b',border:'#dcded6',ring:primary[600], error:'#9f2f2d',warning:'#78570f',success:'#346538',info:'#365a70' },
    fontFamily: { sans:['Helvetica Neue','Arial','sans-serif'], display:['Georgia','Times New Roman','serif'], mono:['SFMono-Regular','Consolas','monospace'] },
    borderRadius: { DEFAULT:'6px',md:'6px',lg:'8px' },
    boxShadow: { overlay:'0 8px 24px rgb(0 0 0 / 0.08)' },
    transitionDuration: { DEFAULT:'150' },
    transitionTimingFunction: { DEFAULT:'ease-out' }
  } },
  plugins: []
};
