import { currentUser, getProfile, listSetResults } from "./lib/supabase-client.js";
import { listProgramAdjustments } from "./lib/program-client.js";
import { buildNextSessionInsight } from "./lib/next-session-insight.mjs";

let renderToken = 0;
let scheduled = null;
if (!document.querySelector('link[href="/next-session-insight.css"]')) {
  const link=document.createElement("link");link.rel="stylesheet";link.href="/next-session-insight.css";document.head.appendChild(link);
}
function escapeHtml(value){return String(value??"").replace(/[&<>\"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));}
function clearInsights(){for(const node of document.querySelectorAll("#exerciseList .next-session-insight"))node.remove();}
function cachedWorkout(){try{return JSON.parse(localStorage.getItem("trainsync:lastWorkout")||"null");}catch{return null;}}
async function renderInsights(workout){
  const token=++renderToken;clearInsights();
  if(!currentUser()||!workout?.exercises?.length)return;
  try{
    const [profile,setResults,adjustments]=await Promise.all([
      getProfile().catch(()=>null),
      listSetResults(600).catch(()=>[]),
      workout.programId?listProgramAdjustments(workout.programId,100).catch(()=>[]):Promise.resolve([]),
    ]);
    if(token!==renderToken)return;
    const rows=[...document.querySelectorAll("#exerciseList .exercise-item")];
    workout.exercises.forEach((exercise,index)=>{
      const insight=buildNextSessionInsight({exercise,setResults,adjustments,programSessionId:workout.programSessionId||null,units:profile?.units||"metric"});
      const row=rows[index];if(!row||!insight?.text)return;
      const line=document.createElement("div");line.className="next-session-insight";line.innerHTML=`<span>${escapeHtml(insight.text)}</span>`;row.appendChild(line);
    });
  }catch{clearInsights();}
}
function scheduleFromCache(){clearTimeout(scheduled);scheduled=setTimeout(()=>{const workout=cachedWorkout();if(workout)renderInsights(workout);},80);}
const exerciseList=document.querySelector("#exerciseList");
if(exerciseList){
  new MutationObserver((mutations)=>{
    if(mutations.some(mutation=>[...mutation.addedNodes].some(node=>node.nodeType===1&&node.classList?.contains("exercise-item"))))scheduleFromCache();
  }).observe(exerciseList,{childList:true});
}
window.addEventListener("trainsync:workout-rendered",event=>renderInsights(event.detail?.workout));
setTimeout(scheduleFromCache,250);
