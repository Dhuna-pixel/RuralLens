export const defaults=Object.freeze({compactTables:false,theme:'system',textSize:'standard',reducedMotion:false,numberFormat:'compact',landingPage:'home',pageSize:50,portfolioSort:'risk',notifyRisk:true,notifyInterventions:true});
let preferences={...defaults},loading;
const systemTheme=window.matchMedia('(prefers-color-scheme: dark)');
export const getPreferences=()=>({...preferences});
function renderTheme(){document.documentElement.dataset.theme=preferences.theme==='system'?(systemTheme.matches?'dark':'light'):preferences.theme;document.documentElement.style.colorScheme=document.documentElement.dataset.theme;}
export function setTheme(theme){if(!['system','light','dark'].includes(theme))throw Error('Invalid theme');preferences={...preferences,theme};renderTheme();}
export function applyPreferences(value){preferences={...defaults,...value,landingPage:'home'};renderTheme();document.documentElement.dataset.textSize=preferences.textSize;document.documentElement.classList.toggle('reduce-motion',preferences.reducedMotion);document.body.classList.toggle('compact-tables',preferences.compactTables);window.dispatchEvent(new CustomEvent('preferenceschanged',{detail:getPreferences()}));return getPreferences();}
systemTheme.addEventListener('change',()=>{if(preferences.theme==='system')renderTheme();});
export function loadPreferences(){return loading??=fetch('/api/preferences',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Could not load workspace preferences');return applyPreferences(await r.json());});}
export function displayMoney(value){const n=Number(value)||0;if(preferences.numberFormat==='full')return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n);if(n>=1e7)return`₹${(n/1e7).toFixed(2)} Cr`;if(n>=1e5)return`₹${(n/1e5).toFixed(1)} L`;return`₹${Math.round(n).toLocaleString('en-IN')}`;}
