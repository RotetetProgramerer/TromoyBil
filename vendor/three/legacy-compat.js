/* Gjør three.js r170 likt r128 for det klassiske RC-spillet (index.html i klassisk modus og props.html).
   Lastes rett etter three.global.min.js. Den nye bilsimulatoren (sim/) bruker three.js slik den er og trenger ikke dette.
   - Fargene: koden regner selv om fra sRGB til lineært (convertSRGBToLinear), så three.js skal ikke gjøre det en gang til.
   - texture.encoding / renderer.outputEncoding heter nå colorSpace / outputColorSpace.
   - Lysene: r128 regnet med «legacy»-lys der lysstyrken ble ganget med π og avstanden dempet lineært. */
(function(){const T=THREE;
  T.ColorManagement.enabled=false;
  T.sRGBEncoding=3001;T.LinearEncoding=3000;
  Object.defineProperty(T.Texture.prototype,'encoding',{configurable:true,
    get(){return this.colorSpace===T.SRGBColorSpace?3001:3000},set(v){this.colorSpace=v===3001?T.SRGBColorSpace:T.NoColorSpace}});
  Object.defineProperty(T.WebGLRenderer.prototype,'outputEncoding',{configurable:true,
    get(){return this.outputColorSpace===T.SRGBColorSpace?3001:3000},set(v){this.outputColorSpace=v===3001?T.SRGBColorSpace:T.LinearSRGBColorSpace}});
  const C=T.ShaderChunk,rep=(s,a,b)=>{if(typeof a==='string'?!s.includes(a):!a.test(s))console.warn('legacy-compat: fant ikke',a);return s.replace(a,b)};
  let L=C.lights_pars_begin;
  L=rep(L,'vec3 irradiance = ambientLightColor;','vec3 irradiance = ambientLightColor * PI;');
  L=rep(L,/float getDistanceAttenuation\([^)]*\)\s*\{[\s\S]*?return distanceFalloff;\s*\}/,
    'float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {\n'+
    '\tif ( cutoffDistance > 0.0 && decayExponent > 0.0 ) return pow( saturate( - lightDistance / cutoffDistance + 1.0 ), decayExponent );\n\treturn 1.0;\n}');
  L=rep(L,'light.color = directionalLight.color;','light.color = directionalLight.color * PI;');
  L=rep(L,'light.color = pointLight.color;','light.color = pointLight.color * PI;');
  L=rep(L,'light.color = spotLight.color * spotAttenuation;','light.color = spotLight.color * spotAttenuation * PI;');
  L=rep(L,'vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );','vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight ) * PI;');
  C.lights_pars_begin=L;
})();
