export const NEXT_SESSION_INSIGHT_VERSION = "2026-08-28.1";
const KG_TO_LB = 2.2046226218;
function arr(v){return Array.isArray(v)?v:[];}
function num(v){if(v==null||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function fmt(v){const n=num(v);return n==null?"—":String(Number.isInteger(n)?n:Math.round(n*10)/10);}
function ms(v){const x=Date.parse(v||"");return Number.isFinite(x)?x:0;}
function load(kg,units){const n=num(kg);if(n==null||n<0)return null;const imperial=units==="imperial";return{value:Math.round((imperial?n*KG_TO_LB:n)*10)/10,unit:imperial?"LB":"KG"};}
function range(min,max,exact,suffix=""){const e=num(exact),a=num(min),b=num(max);const base=e!=null?fmt(e):(a!=null&&b!=null&&a!==b?`${fmt(a)}–${fmt(b)}`:fmt(a??b));return suffix?`${base} ${suffix}`:base;}
function scalar(values,label){const xs=arr(values).map(num).filter(v=>v!=null);if(!xs.length)return null;const a=Math.min(...xs),b=Math.max(...xs);return a===b?`${label} ${fmt(a)}`:`${label} ${fmt(a)}–${fmt(b)}`;}

export function latestExerciseExposure(setResults=[],exerciseKey){
  const groups=new Map();
  for(const row of arr(setResults)){
    if(row?.is_warmup||String(row?.exercise_key||"")!==String(exerciseKey||"")||!row?.session_id)continue;
    if(!groups.has(row.session_id))groups.set(row.session_id,[]);
    groups.get(row.session_id).push(row);
  }
  return [...groups.entries()].map(([sessionId,rows])=>({sessionId,completedAt:rows.reduce((latest,row)=>ms(row.completed_at)>ms(latest)?row.completed_at:latest,rows[0]?.completed_at||null),rows:[...rows].sort((a,b)=>Number(a.set_index||0)-Number(b.set_index||0))})).sort((a,b)=>ms(b.completedAt)-ms(a.completedAt))[0]||null;
}

export function latestRelevantAdjustment(adjustments=[],exerciseKey,programSessionId=null){
  return arr(adjustments).filter(item=>(String(item?.target_key||"")===String(exerciseKey||"")||String(item?.after_state?.exerciseKey||"")===String(exerciseKey||""))&&String(item?.adjustment_type||"")!=="schedule").filter(item=>!programSessionId||String(item?.program_session_id||"")===String(programSessionId)).sort((a,b)=>ms(b.created_at)-ms(a.created_at))[0]||null;
}

export function formatLastExposure(exposure,{units="metric"}={}){
  const rows=arr(exposure?.rows);if(!rows.length)return null;
  const timed=rows.every(row=>String(row.metric_type||"reps")==="duration_seconds");
  const loads=rows.map(row=>num(row.weight_kg)).filter(v=>v!=null&&v>0);
  const sameLoad=loads.length===rows.length&&loads.every(v=>v===loads[0])?load(loads[0],units):null;
  let work;
  if(timed){const xs=rows.map(row=>num(row.duration_seconds)).filter(v=>v!=null&&v>0);work=xs.length?`${xs.map(fmt).join(",")} SEC`:"TIMED SETS";}
  else{const reps=rows.map(row=>num(row.reps)).filter(v=>v!=null&&v>0);work=reps.length?`${reps.map(fmt).join(",")} REPS`:"SETS RECORDED";}
  if(sameLoad)work=`${fmt(sameLoad.value)} ${sameLoad.unit} × ${work.replace(/ REPS$/,'')}`;
  const rir=scalar(rows.map(row=>row.rir),"RIR");
  const rpe=rir?null:scalar(rows.map(row=>row.rpe),"RPE");
  return[work,rir||rpe].filter(Boolean).join(" · ");
}

export function formatCurrentPrescription(exercise,{units="metric"}={}){
  const sets=arr(exercise?.sets);if(!sets.length)return"NO PRESCRIPTION";
  const first=sets[0],timed=String(first.metricType||"reps")==="duration_seconds";
  const target=timed?range(first.minDurationSeconds,first.maxDurationSeconds,first.targetDurationSeconds,"SEC"):`${range(first.minReps,first.maxReps,first.targetReps)} REPS`;
  const weights=sets.map(set=>num(set.weightKg)).filter(v=>v!=null&&v>0);
  const sameLoad=weights.length===sets.length&&weights.every(v=>v===weights[0])?load(weights[0],units):null;
  const rir=num(first.targetRir)!=null?` · RIR ${fmt(first.targetRir)}`:"";
  return`${sameLoad?`${fmt(sameLoad.value)} ${sameLoad.unit} × `:""}${target}${rir}`;
}

function compactReason(item){
  if(!item)return"PRESCRIPTION HELD";
  const code=String(item.reason_code||""),type=String(item.adjustment_type||"");
  const map={REPEATED_OVERPERFORMANCE:"PROGRESSED AFTER REPEATED SUCCESS",REPEATED_TOP_RANGE_COMPLETION:"PROGRESSED AFTER REPEATED TOP-RANGE COMPLETION",REPEATED_HIGH_EFFORT_UNDERPERFORMANCE:"VOLUME REDUCED AFTER REPEATED HIGH-EFFORT MISSES",REPEATED_FATIGUE_SIGNAL:"VOLUME REDUCED AFTER REPEATED HIGH-EFFORT MISSES",RECOVERED_AFTER_VOLUME_REDUCTION:"WORKING SET RESTORED AFTER STABLE RECOVERY"};
  if(map[code])return map[code];
  if(type==="progress_load")return"LOAD PROGRESSED FROM RECORDED PERFORMANCE";
  if(type==="progress_reps")return"REP TARGET PROGRESSED FROM RECORDED PERFORMANCE";
  if(type==="progress_duration")return"TIME TARGET PROGRESSED FROM RECORDED PERFORMANCE";
  if(type==="progress_variant")return"REGISTERED HARDER VARIATION APPLIED";
  if(type==="reduce_or_review")return"PRESCRIPTION REDUCED AFTER REPEATED UNDERPERFORMANCE";
  if(type==="restore_volume")return"WORKING SET RESTORED AFTER STABLE PERFORMANCE";
  return"PRESCRIPTION UPDATED FROM RECORDED PERFORMANCE";
}

export function buildNextSessionInsight({exercise,setResults=[],adjustments=[],programSessionId=null,units="metric"}={}){
  const exerciseKey=String(exercise?.exerciseKey||"").trim();if(!exerciseKey)return null;
  const exposure=latestExerciseExposure(setResults,exerciseKey),adjustment=latestRelevantAdjustment(adjustments,exerciseKey,programSessionId),today=formatCurrentPrescription(exercise,{units}),last=formatLastExposure(exposure,{units});
  const reason=exposure?compactReason(adjustment):"FIRST RECORDED EXPOSURE";
  return{version:NEXT_SESSION_INSIGHT_VERSION,exerciseKey,last,today,reason,adjustmentId:adjustment?.id||null,text:exposure?`LAST ${last} → TODAY ${today} · ${reason}`:`TODAY ${today} · FIRST RECORDED EXPOSURE`};
}
