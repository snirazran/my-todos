const lin=(c)=>{c/=255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4};
const lum=([r,g,b])=>0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
const cr=(a,b)=>{const l=[lum(a),lum(b)].sort((x,y)=>y-x);return (l[0]+.05)/(l[1]+.05)};
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const hsl=(h,s,l)=>{s/=100;l/=100;const k=n=>(n+h/30)%12;const a=s*Math.min(l,1-l);
 const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));return [f(0),f(8),f(4)].map(v=>Math.round(v*255))};
const white=[255,255,255];
const primaryLight=hsl(142,76,36), primaryDark=hsl(142,65,55);
const darkBg=hsl(150,22,7), darkCard=hsl(150,18,10);
console.log('current primary light', primaryLight.map(v=>v.toString(16).padStart(2,'0')).join(''), 'on white', cr(primaryLight,white).toFixed(2));
console.log('current primary dark  on dark card', cr(primaryDark,darkCard).toFixed(2));
for (const c of ['#15803d','#136c33','#11662f','#0f7a37','#166534','#14532d']) {
  console.log(c, 'on white', cr(hex(c),white).toFixed(2), '| on #f5f5f5', cr(hex(c),hex('#f5f5f5')).toFixed(2));
}
console.log('--- dark mode candidates on card', darkCard.join(','));
for (const c of ['#7fd694','#8ee0a2','#a9df97','#6fd08a']) console.log(c, cr(hex(c),darkCard).toFixed(2));
console.log('--- muted-foreground', hsl(0,0,45.1).join(','), 'on white', cr(hsl(0,0,45.1),white).toFixed(2));
