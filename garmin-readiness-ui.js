import "./next-session-insight-ui.js";
import { garminFitProjectionReadiness } from "./lib/garmin-workout-projection.mjs";
import { garminReadinessUiModel } from "./lib/garmin-readiness-ui.mjs";

const WORKOUT_KEY = "trainsync:lastWorkout";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[char]));
}
function storedWorkout() { try { return JSON.parse(localStorage.getItem(WORKOUT_KEY) || "null"); } catch { return null; } }
function applyReadiness() {
  const node=document.querySelector("#validationState"),publishButton=document.querySelector("#publishButton");
  if(!node||!publishButton||node.classList.contains("error"))return;
  const workout=storedWorkout();if(!workout?.exercises?.length)return;
  const readiness=garminFitProjectionReadiness(workout),model=garminReadinessUiModel(readiness,{programSession:Boolean(workout.programSessionId)});
  node.className=`validation-state garmin-readiness-state ${model.tone}`;
  node.innerHTML=`<span class="garmin-readiness-icon">${escapeHtml(model.icon)}</span><span class="garmin-readiness-copy"><b>${escapeHtml(model.baseLabel)}</b><small>${escapeHtml(model.garminLabel)}</small></span>`;
  node.title=model.explanation;node.dataset.garminReason=model.reasonCode;node.dataset.garminPublishReady=model.publishReady?"true":"false";
  publishButton.dataset.garminReason=model.reasonCode;publishButton.dataset.garminPublishReady=model.publishReady?"true":"false";
  if(model.publishReady)publishButton.title="Exact targets pass the strict Garmin projection contract. Official sync is shown only when an authorized provider is connected.";
  else if(model.reasonCode==="GARMIN_RANGE_DEVICE_VERIFICATION_REQUIRED")publishButton.title="Official Garmin publishing remains blocked until the range-target OPEN representation is verified on compatible hardware.";
  else publishButton.title=`${model.garminLabel}. Projection readiness does not imply an official Garmin connection.`;
}
let scheduled=false;
function scheduleReadiness(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;applyReadiness();});}
const exerciseList=document.querySelector("#exerciseList");
if(exerciseList)new MutationObserver(scheduleReadiness).observe(exerciseList,{childList:true,subtree:true});
window.addEventListener("storage",event=>{if(event.key===WORKOUT_KEY)scheduleReadiness();});
window.addEventListener("pageshow",scheduleReadiness);
scheduleReadiness();
