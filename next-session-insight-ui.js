import { currentUser, getProfile, listSetResults } from "./lib/supabase-client.js";
import { listProgramAdjustments } from "./lib/program-client.js";
import { buildNextSessionInsight } from "./lib/next-session-insight.mjs";

let renderToken = 0;
function escapeHtml(value){return String(value??"").replace(/[&<>\"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));}
function clearInsights(){for(const node of document.querySelectorAll("#exerciseList .next-session-insight"))node.remove();}
async function renderInsights(workout){
  const token=++renderToken;
  clearInsights();
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
      const row=rows[index];
      if(!row||!insight?.text)return;
      const line=document.createElement("div");
      line.className="next-session-insight";
      line.innerHTML=`<span>${escapeHtml(insight.text)}</span>`;
      row.appendChild(line);
    });
  }catch{
    clearInsights();
  }
}
window.addEventListener("trainsync:workout-rendered",event=>renderInsights(event.detail?.workout));
try{const cached=JSON.parse(localStorage.getItem("trainsync:lastWorkout")||"null");if(cached)setTimeout(()=>renderInsights(cached),250);}catch{}
