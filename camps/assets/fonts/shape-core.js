// Minimal OpenType GSUB interpreter (lookup types 1, 2, 4 and chaining format 3) for the Thai "ccmp" step.
var N2C={},C2N=D.thai;for(var k in C2N)N2C[C2N[k]]=+k;for(var p in D.pua)N2C[p]=D.pua[p];
var SETS={};function cs(a){var key=a.join("|");return SETS[key]||(SETS[key]=a.reduce(function(o,x){o[x]=1;return o},{}))}
function applySingle(li,g,i){var m=D.look[li][0].m;if(m[g[i]])g[i]=m[g[i]]}
function run(li,g){
 var subs=D.look[li];
 for(var i=0;i<g.length;i++){
  for(var s=0;s<subs.length;s++){var st=subs[s],hit=false;
   if(st.t===1){if(st.m[g[i]]){g[i]=st.m[g[i]];hit=true}}
   else if(st.t===2){if(st.m[g[i]]){var r=st.m[g[i]];g.splice.apply(g,[i,1].concat(r));i+=r.length-1;hit=true}}
   else if(st.t===4){var ls=st.m[g[i]];if(ls)for(var q=0;q<ls.length&&!hit;q++){var c=ls[q][0],ok=true;for(var j=0;j<c.length;j++)if(g[i+1+j]!==c[j]){ok=false;break}
     if(ok){g.splice(i,1+c.length,ls[q][1]);hit=true}}}
   else if(st.t===6){var ok=true,n=st.i.length;
    for(var j=0;j<n&&ok;j++)if(!st._i||!st._i[j]){}
    st._b=st._b||st.b.map(cs);st._i=st._i||st.i.map(cs);st._a=st._a||st.a.map(cs);
    for(var j=0;j<n&&ok;j++)if(!st._i[j][g[i+j]])ok=false;
    for(var j=0;j<st._b.length&&ok;j++)if(!st._b[j][g[i-1-j]])ok=false;
    for(var j=0;j<st._a.length&&ok;j++)if(!st._a[j][g[i+n+j]])ok=false;
    if(ok){for(var r=0;r<st.r.length;r++)applySingle(st.r[r][1],g,i+st.r[r][0]);hit=true}}
   if(hit)break}
 }
}
function shapeRun(str){
 var g=[];for(var i=0;i<str.length;i++)g.push(C2N[str.charCodeAt(i)]||null);
 if(g.indexOf(null)>=0)return str;
 D.order.forEach(function(li){run(li,g)});
 return g.map(function(n){return String.fromCharCode(N2C[n])}).join("");
}
// Replace Thai runs with their contextual glyph variants (private-use code points in SarabunTH-*.ttf).
g.thaiShape=function(s){if(s==null)return s;s=String(s);return s.replace(/[฀-๿]+/g,shapeRun)};
